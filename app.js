var request = require('request').defaults({jar: true, strictSSL: false})  
var cheerio = require('cheerio') 
var async = require('async')
var co = require('co')
var thunkify = require('thunkify')
var debug = require('debug')('open-payments')
var merge = require('merge')
var argv = require('minimist')(process.argv.slice(2))
var fs = require('fs')

if( argv.length < 2 || !argv.user || !argv.password ) {
	console.error('usage: node app --user <username> --password <password> --outdir <folder> --debug_files <folder>') ;
	return ;
}

runIt( function(err) {
	if( err ) console.log(err) ;
	else debug('completed')
}) ;

var $ ;

function runIt( callback ) {
	console.log('connecting to cms portal...')
	request('https://portal.cms.gov/wps/myportal', function(error, response, body){
		if( error ) throw error ;
		if( response.statusCode !== 200 ) return callback('failed to connect to cms.gov') ;
		
		console.log('Accepting terms..') ;

		r({
			uri: 'https://eidm.cms.gov/EIDMLoginApp/userlogin.jsp'
			,method: 'POST'
			,form: {
				terms: 'accept'
				,termsaccepted: 'I Accept'			
			}
		}, function( err, response, body ){
			if( err ) throw err ;
			if( response.statusCode !== 200 ) return callback('post to I accept: ' + response.statusCode) ;

			console.log('Logging in...') ;

			r({
				uri: 'https://eidm.cms.gov/oam/server/auth_cred_submit'
				,method: 'POST'
				,form: {
					userid: argv.user
					,password: argv.password
					,submit: 'Log In'
				}
			}, function(err, response, body){
				if( err ) return callback( err ) ;

				if( response.statusCode === 302 ) {
					r(response.headers['location'], function(err, response, body){
						if( err ) throw err ;
						if( response.statusCode !== 200 ) return callback('response to get of provided location: ' + response.statusCode) ;

						console.log('Successfully logged in....') ;
						console.log('selecting dropdown for open payments portal...') ;
						//$ = cheerio.load(body); 
						var href = $('a.navflySub2[href*="/wps/myportal/cmsportal/op/op_reg"]').attr('href') ;
						if( !href ) return callback('did not get expected welcome page') ;

						r('https://portal.cms.gov' + href, function(err, response, body){
							if( err ) throw err ;
							if( response.statusCode !== 200 ) throw new Error('response navigating to open payments page %d', response.statusCode);

							if( -1 !== body.indexOf('This portlet is unavailable.') ) return callback('Darn, CMS open payment system is down :(')

							debug('selecting review and dispute...') ;
							//var $ = cheerio.load(body) ;
							var form = $('.cmsPortletContainerThin form') ;
							if( !form ) throw new Error('cant find form') ;

							var a = form.find('div.top-nav ul li').eq(1).find('a') ;
							if(!a) debug('couldnt find anchor') ;
							
							var formData = {} ;
							formData[a.attr('id')] = a.attr('id') ;
							formData[form.attr('id')] = form.attr('id') ;
							formData['javax.faces.ViewState'] = 'j_id1:j_id2' ;

							r({
								uri: 'https://portal.cms.gov' + form.attr('action')
								,method: 'POST'
								,form: formData
							}, function(err, response, body) {
								if( err ) return callback( err ) ;

								//var $ = cheerio.load(body) ;
								var options = $('.ProfileResults .FormRow.grid_400').eq(0).find('select option') ;
								debug('Found %d physicians', options.length -1 ) ;

								var hcps = [] ;
								options.each( function(idx, el){
									if( 0 == idx ) return ;
									debug($(this).html()) ;
									hcps.push({
										name: $(this).html() 
										,org: $(this).attr('value') 
										,data: []
										,transactions: []
									}) ;
								}) ;

								getAllHcpData( hcps, body, function( err, hcps ) {
									if( err ) return callback( err ) ;
									writeHcpData( hcps ) ;
									callback(null) ;
								}) ;
							})
						}) ;
					}) ;
				}
			})
		}) ;
	}) ;
};

function getOnePageOfHcpData( hcp, page, numPages, callback ) {
	debug('retrieving data for page %d of %d for %s', page, numPages, hcp.name) ;

	var start = hcp.transactions.length ;
	var form = $('form') ;
	var tr = $('.CallOut.fullCallOut table.SearchDataTable > tbody > tr') ;

	tr.each( function() {

		var data = {} ;
		var el = [null,'entity','record_id',null,'category','form_of_payment','nature_of_payment','transaction_date',
			'amount','delay_in_pub','last_modified_date','current_standing','review_status','dispute_date','dispute_last',
			'affirmed'] ;

		for( var i = 0; i < 16; i++ ) {
			if( 0 == i || 3 == i ) continue ;
			data[el[i]] = $(this).find('td').eq(i).find('div').html() ;
		}

		var js = $(this).find('td').eq(17).find('a').attr('onclick') ;
		var re = /jsfcljs\(document.forms\['(\S+)'],{'(\S+)':'(\S+)'/ ;
		var arr = re.exec( js ) ;

		var obj = {} ;
		obj[arr[1]] = arr[1] ;
		obj[arr[2]] = arr[2] ;

		hcp.transactions.push({
			data: data
			,detail_form_data: obj 
		}) ;
	}) ;

	//get the detail for each transaction, coming back to the hcp summary page after each
	async.eachSeries( hcp.transactions.slice(start), function(txn, cb){
		debug('getting detail for %s, record id %s', txn.data.entity, txn.data.record_id ) ;

		button = form.find('input[value="Back"]') ;
		hidden = form.find('input[type="hidden"]') ;
		action = form.attr('action') ;
		vs = form.find('input[name="javax.faces.ViewState"]').attr('value') ;
		r({
			uri: 'https://portal.cms.gov' + form.attr('action')
			,method: 'POST'
			,form: merge( txn.detail_form_data, {'javax.faces.ViewState': vs})
		}, function(err, response, body){
			if( err ) return cb(err) ;

			var recordId = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > .TextArea > .ProfileResults > h1') ;
			//debug('got detail page for %s', recordId.html().trim()) ;
			var h2 = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > .TextArea > .ProfileResults > h2');
			if( h2.length === 4 ) {
				//payment
				var div = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > .TextArea > .ProfileResults .grid_625');
				div.each( function(idx, d){
					var span = $(d).find('span') ;
					if( !!span && span.children.length && 3 == d.children.length) {
						var text = d.children[2].data.trim() ; 
						var nm = [null,null,null,'recipient_type','first','middle','last','suffix','address1',
						'address2','city','state','zipcode','country','province','postal_code','email','physician_type',
						'npi','specialty','lic_state1','lic_no1','lic_state2','lic_no2','lic_state3','lic_no3',
						'lic_state4','lic_no4','lic_state5','lic_no5','associated_drug','prod_indicator',
						'name_drug','natl_drug_code','name_device',null,'total_payment','date_payment','num_payments','form_payment','nature_payment',
						null,'ownership_indicator','third_party_payment','third_party_name','charity','third_party_is_covered_recip',
						'delay_in_pub','contextual_info'] ;
						if( idx < nm.length && nm[idx] !== null ) txn.data[nm[idx]] = text ;
					}
				}) ;
			}
			else {
				var span = $('span.paddingLfRt10');
				span.each( function(idx){
					var spans = $(this).closest('td').find('span') ;
					if( spans && spans.length === 2 ) {
						var text = spans.eq(1).html() ;
						var nm = ['first','middle','last','suffix','address1','address2','city','state','zipcode','country',
						'province','postal_code','email','physician_type','npi','specialty','lic_state1','lic_no1','lic_state2','lic_no2',
						'lic_state3','lic_no3','lic_state4','lic_no4','lic_state5','lic_no5','gpo_reporting_name',
						'gpo_reporting_id','interest_held_by','investment_amount','investment_value','investment_terms'] ;
						txn.data[nm[idx]] = text ;
					}
				})
			}

			//back
			form = $('form') ;
			var formId = form.attr('id') ;
			var button = form.find('.ButtonRow .leftSide input[type=submit]') ;
			vs = $('input[name="javax.faces.ViewState"]').attr('value') ;

			var fd = {} ;
			fd['javax.faces.ViewState'] = vs ;
			fd[formId] = formId ;
			fd[button.attr('name')] = 'Back' ;

			r({
				uri: 'https://portal.cms.gov' + form.attr('action')
				,method: 'POST'
				,form: fd
			}, function(err, response, body){
				if( err ) return cb(err) ;
				form = $('form') ;
				cb(null) ;
			}) ;
		}); 
	}, function(err){
		//completed getting one page of data
		//navigate to next page if there are more pages
		
		if( err ) return callback(err) ;

		debug('retrieved page %d of %d', page, numPages) ;

		if( page == numPages ) {
			debug('got all pages for %s, returning', hcp.name) ;
			return callback() ;
		}

		//go to next page
		var form = $('form') ;
		var formId = form.attr('id') ;
		var formData = {} ;
		formData[formId] = formId ;

		form.find('input[type=hidden]').each( function(){
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;
			formData[name] = value || null;

		})
		
		form.find('select').each( function(){
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;

			if( -1 !== name.indexOf('reviewAndDisputeStatus') ) return ;

			if( -1 !== name.indexOf('EntriesReturned')) value = 10 ;
			formData[name] = value || null;

		})

		form.find('input[type=text]').each( function(){
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;
			if( -1 !== name.indexOf('pagerGoText') ) value = '' + (page+1) ;

			formData[name] = value || null;

		})
		var go = form.find('input[value=Go]') ;
		formData[go.attr('name')] = go.attr('value') ;

		var fd = serialize(formData) ;
		r({
			uri: 'https://portal.cms.gov' + form.attr('action') 
			,method: 'POST'
			,form: fd
		}, function(err, response, body) {
			if( err ) return callback(err) ;
			callback() ;
		}) ;
	}) ;
}

//When this function is called we are sitting on page 1 of the doc's page.
//We need to collect all of the information on each page, and associated detail page
//and end by navigating back to the overview page listing all of the docs in a dropdown
function collectHcpDataAndNavigateBack(body, hcp, callback) {
	hcp.transactions = [] ;

	var pager = $('.CallOut.fullCallOut table.SearchDataTable > tfoot > tr:first-child > td:first-child > table tr:first-child > td:first-child > table > tbody > tr:first-child > td:nth-child(3) > span') ;
	var reg = /Page 1 of (\d+)/ ;
	var pageCount = reg.exec( pager.html() ) ;
	var numPages = pageCount[1] ;
	debug('Number of pages to traverse: %d', numPages) ;
	var page = 1 ;

	async.doWhilst( function(doWhilstCallback){
		getOnePageOfHcpData( hcp, page, numPages, doWhilstCallback) ;
	}
	, function() { 
		debug('got all data on page %d', page) ;
		return ++page <= numPages ;
	}
	, function done(err){ 
		//final callback - got all detail from all pages - navigate back
		
		if( err ) {
			console.error('Error: ', err) ;
			throw err ;
		}
		debug('got all detail, returning to summary page with hcp listing')
		//debug('hcp.transactions: ', hcp.transactions )

		var form = $('form') ;
		var action = form.attr('action') ;

		var formData = {} ;
		var input = form.find('input') ;
		input.each( function() {
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;
			var type = $(this).attr('type') ;

			if( type === 'checkbox' || type === 'image') return ;

			if( type === 'submit' && value !== 'Back') return ;

			formData[name] = value || null;
		}) ;

		r({
			uri: 'https://portal.cms.gov' + action
			,method: 'POST'
			,form: formData
		}, function(err, response, body) {
			if( err ) return callback(err) ;
			callback(null, body, hcp) ;
		}) ;
	}) ;

}

function updateFormData( body ) {
	//$ = cheerio.load(body) ;
	var form = $('form') ;
	var formId = form.attr('id') ;
	var button = form.find('input[value="Show Records"]') ;
	var buttonName = button.attr('name') ;
	var action = form.attr('action') ;

	var formData = {} ;
	formData[formId] = formId ;
	formData[buttonName] = 'Show Records' ;
	formData['javax.faces.ViewState'] = $('form input[name="javax.faces.ViewState"]').attr('value') ;

	return {
		form: formData
		,uri: 'https://portal.cms.gov' + action
		,formId: formId
	} ;
}

function getAllHcpData( hcps, body, cb ) {

	var tasks = [] ;
	hcps.forEach( function(hcp, idx){
		if( 0 == idx ) {
			tasks.push( function(callback) {
				var obj = updateFormData(body) ;
				obj.form[obj.formId+':orgSelected'] = hcp.org ;
				obj.form[obj.formId+':PaymentYear'] = '2013' ;
				debug('getting data for %s', hcp.name) ;
				r({
					uri: obj.uri
					,method: 'POST'
					,form: obj.form
				}, function(err, response, body){
					if( err ) return callback(err) ;
					if( !nodatafound( body ) ) {
						debug('getting hcp detail and then hitting back button')
						collectHcpDataAndNavigateBack( body, hcp, function(err, body, hcpData ) {
							if( err ) return callback(err) ;
							hcp = hcpData ;
							callback(null, updateFormData(body) ) ;
						}) ;
					}
					else {
						callback(null, updateFormData(body) ) ;
					}
				}) ;
			}) ;
		}
		else {
			tasks.push( function(obj, callback) {
				obj.form[obj.formId+':orgSelected'] = hcp.org ;
				obj.form[obj.formId+':PaymentYear'] = '2013' ;

				debug('getting data for %s:', hcp.name) ;
				r({
					uri: obj.uri
					,method: 'POST'
					,form: obj.form
				}, function(err, response, body){
					if( err ) return callback(err) ;
					if( !nodatafound( body ) ) {
						collectHcpDataAndNavigateBack( body, hcp, function(err, body, hcpData ) {
							if( err ) return callback(err) ;
							hcp = hcpData ;
							callback(null, updateFormData(body) ) ;
						}) ;
					}
					else {
						callback(null, updateFormData(body) ) ;
					}
				}) ;
			}) ;			
		}
	}) ;

	async.waterfall( tasks, function( err, results ){
		if( err ) return cb(err) ;
		cb(null, hcps) ;
	})
}
function getvs( body ) {
	//var $ = cheerio.load( body ) ;
	return $('input[name="javax.faces.ViewState"]').attr('value') ;
}
function nodatafound( body ) {
	return  -1 !== body.indexOf('There are no payments or other transfers of value') ;
}
function readHcpData( body ) {

	if( -1 !== body.indexOf('There are no payments or other transfers of value') ) {
		debug('no payments found') ;
		return [] ;
	}

	//var $ = cheerio.load(body) ;
	var page = 1 ;
	var pages = $('.CallOut.fullCallOut table.SearchDataTable tfoot table table tbody tr td')
	.eq(2)
	.find('span').html() ;
	if( !pages ) {
		debug('WARNING: unexpected page format; unable to find Page <> of <>') ;
		return [] ;
	}

	var pos = pages.indexOf(' of ') ;
	pages = parseInt( pages.slice(pos+4)) ;

	debug('%s of payment records found', 1 == pages ? '1 page': (pages + ' pages')) ;

	var data = [] ;
	do {
		var tr = $('.CallOut.fullCallOut table.SearchDataTable > tbody > tr') ;
		debug('page %d has %d open payment records', page, tr.length)

		tr.each( function(row) {
			var payment = [] ;
			$(this).find('td').each( function(col) {
				if( 0 == col || 17 == col || 3 == col) return ;
				payment.push( $(this).find('div').html() ) ;
			}) ;
			data.push( payment ) ;
		}) ;

		if( page++ < pages ) {
			//TODO: get next page
		}
	} while( page <= pages ) ;

	return data ;
}

function r( opts, callback ) {

	if( typeof opts === 'string') opts = {uri: opts, method: 'GET'} ;
	
	request(opts, function( err, response, body ) {
		if( !err && body ) $ = cheerio.load(body) ;

		if( argv.debug_files ) {
			logOutput( err, response, body, opts, callback ) ;
		} else callback( err, response, body ) ;
	}) ;
}

var fileNum = 0 ;
function logOutput( err, response, body, opts, callback ) {
	fileNum++ ;
	async.waterfall([
			function stat( cb ) {
				fs.stat( argv.debug_files, function(err, stats){
					cb(null, stats) ;
				}) ;
			}
			,function mkdir(stats, cb) {
				if( stats && stats.isDirectory() ) return cb(null) ;
				if( stats ) return cb(argv.debug_files + ' is not a directory') ;
				fs.mkdir( argv.debug_files, function(err){
					if( err ) return cb('failure creating debug directory: ' + err) ;
					cb(null)
				}) ;
			}
			,function writeBody(cb) {
				var content ;
				if( !err ) {
					//$ = cheerio.load(body) ;
					var insert = '<div><p>This page retrieved with ' + opts.method + ' ' + opts.uri + '</p></div>' ;
					if( opts.form ) {
						insert += '<div><p>Form data passed: <pre>' + JSON.stringify(opts.form) + '</pre></p></div>' ;
					}
					$('body').prepend(insert); 
					content = $.html() ;
				}
				else content = err ;
				fs.writeFile(argv.debug_files + '/' + fileNum + '.html', content, function(err) {
					if( err ) return cb(err) ;
					cb(null);
				})
			}

		], function(err){
			if( err ) return callback( err ) ;
			callback(err, response, body) ;
	})
}

function writeHcpData( hcps, callback ) {
	//debug('time to write hcp data: ', JSON.stringify(hcps)) ;
	var names = getAttributeName() ;

	hcps.forEach( function(hcp){
		var filename = argv.outdir + '/' + hcp.name.toLowerCase().replace(/ /g,'_') + '.csv' ;
		debug('writing data for %s to %s', hcp.name, filename) ;
		var stream = fs.createWriteStream(filename);
		stream.once('open', function(fd){
			stream.write(names.join(',') + '\n') ;
			debug('about to write transactions for hcp: ', hcp);
			hcp.transactions.forEach( function(txn){
				names.forEach( function(name, idx) {
					if( 0 != idx ) stream.write(',') ;

					if( txn.data[name] ) stream.write('"' + txn.data[name] + '"') ;
					else stream.write('') ;
				})
				stream.write('\n') ;
			}) ;
			stream.end() ;
		}) ;
	}) ;
	return ;
}
function serialize(obj) {
	var str = [];
	for(var p in obj) {
		if (obj.hasOwnProperty(p)) {
			var value = obj[p] ;
			if( null !== value ) str.push(encodeURIComponent(p) + "=" + encodeURIComponent(value));
			else str.push(encodeURIComponent(p) + "=") ;
		}
	}
	return str.join("&");
}

function getAttributeName() {

	return ['record_id','entity','transaction_date','amount','category','form_of_payment','nature_of_payment',
	'investment_amount','investment_value','investment_terms','delay_in_pub','last_modified_date','current_standing',
	'review_status','dispute_date','dispute_last','affirmed','recipient_type','first','middle','last','suffix','address1',
	'address2','city','state','zipcode','country','province','postal_code','email','physician_type','npi','specialty',
	'lic_state1','lic_no1','lic_state2','lic_no2','lic_state3','lic_no3','lic_state4','lic_no4','lic_state5','lic_no5',
	'associated_drug','prod_indicator','name_drug','natl_drug_code','name_device','total_payment','date_payment','num_payments',
	'form_payment','nature_payment','ownership_indicator','third_party_payment','third_party_name','charity',
	'third_party_is_covered_recip','contextual_info','gpo_reporting_name','gpo_reporting_id','interest_held_by'] ;

}
