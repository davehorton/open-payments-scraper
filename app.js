var request = require('request').defaults({jar: true, strictSSL: false})  ;
var cheerio = require('cheerio') ;
var async = require('async') ;
var debug = require('debug')('open-payments') ;
var merge = require('merge') ;
var argv = require('minimist')(process.argv.slice(2)) ;
var fs = require('fs') ;
var _ = require('lodash') ;
var ent = require('ent') ;

if( argv.length < 2 || !argv.user || !argv.password ) {
	console.error('usage: node app --user <username> --password <password> --outdir <folder> --debug_files <folder>') ;
	return ;
}

runIt( function(err) {
	if( err ) { console.log(err) ; } 
	console.log('Completed writing data, exiting...') ;
}) ;

var $ ;

var nm_general = [null,'entity','record_id',null,'category','form_of_payment','nature_of_payment','transaction_date',
'amount','delay_in_pub','last_modified_date','current_standing','review_status','pi','pi_only',
'dispute_date','dispute_last','affirmed'] ;

var nm_research_teaching = ['res_recipient_type','res_teaching_hospital_name','res_teaching_hospital_taxpayer_id','res_prod_indicator','res_ndc_code',
'res_name_device',
'res_name_drug','res_man_gpo_name','res_man_gpo_reg_id','res_total_payment','res_date_payment','res_form_of_payment','res_salary_support',
'res_research_writing_or_pub',
'res_patient_care','res_non_patient_care','res_overhead','res_research_other','res_pre_clinical_indicator','res_delay_in_pub',
'res_study_name',
'res_research_context','res_clinical_trial_identifier','res_research_link','res_pi_covered',null,
'res_pi_first','res_pi_middle','res_pi_last','res_pi_suffix','res_pi_address1','res_pi_address2','res_pi_city','res_pi_state','res_pi_zipcode',
'res_pi_country','res_pi_province','res_pi_postal_code','res_pi_primary_type','res_pi_npi','res_pi_taxonomy',
'res_pi_license_state1','res_pi_license_number1','res_pi_license_state2','res_pi_license_number2','res_pi_license_state3','res_pi_license_number3',
'res_pi_license_state4','res_pi_license_number4','res_pi_license_state5','res_pi_license_number5'] ;

var nm_research_non_covered_entity = ['res_recipient_type','res_non_covered_entity','res_prod_indicator','res_ndc_code',
'res_name_device',
'res_name_drug','res_man_gpo_name','res_man_gpo_reg_id','res_total_payment','res_date_payment','res_form_of_payment','res_salary_support',
'res_research_writing_or_pub',
'res_patient_care','res_non_patient_care','res_overhead','res_research_other','res_pre_clinical_indicator','res_delay_in_pub',
'res_study_name',
'res_research_context','res_clinical_trial_identifier','res_research_link','res_pi_covered',null,
'res_pi_first','res_pi_middle','res_pi_last','res_pi_suffix','res_pi_address1','res_pi_address2','res_pi_city','res_pi_state','res_pi_zipcode',
'res_pi_country','res_pi_province','res_pi_postal_code','res_pi_primary_type','res_pi_npi','res_pi_taxonomy',
'res_pi_license_state1','res_pi_license_number1','res_pi_license_state2','res_pi_license_number2','res_pi_license_state3','res_pi_license_number3',
'res_pi_license_state4','res_pi_license_number4','res_pi_license_state5','res_pi_license_number5'] ;

var nm_research_covered_physician = ['res_recipient_type','res_pi_first','res_pi_middle','res_pi_last','res_pi_suffix','res_pi_address1','res_pi_address2','res_pi_city','res_pi_state','res_pi_zipcode',
'res_pi_country','res_pi_province','res_pi_postal_code','res_email','res_pi_npi','res_pi_primary_type','res_pi_taxonomy',
'res_pi_license_number1','res_pi_license_state1','res_pi_license_number2','res_pi_license_state2','res_pi_license_number3','res_pi_license_state3',
'res_pi_license_number4','res_pi_license_state4','res_pi_license_number5','res_pi_license_state5',
'res_prod_indicator',
'res_ndc_code','res_name_device','res_name_drug',
'res_man_gpo_name','res_man_gpo_reg_id','res_total_payment','res_date_payment','res_form_of_payment','res_salary_support',
'res_research_writing_or_pub','res_patient_care','res_non_patient_care','res_overhead','res_research_other',
'res_pre_clinical_indicator','res_delay_in_pub','res_study_name','res_research_context','res_clinical_trial_identifier',
'res_research_link','res_pi_covered'] ;

var nm_payments = ['pay_recipient_type','pay_first','pay_middle','pay_last','pay_suffix','pay_address1',
'pay_address2','pay_city','pay_state','pay_zipcode','pay_country','pay_province','pay_postal_code','pay_email','pay_physician_type',
'pay_npi','pay_taxonomy','pay_lic_state1','pay_lic_no1','pay_lic_state2','pay_lic_no2','pay_lic_state3','pay_lic_no3',
'pay_lic_state4','pay_lic_no4','pay_lic_state5','pay_lic_no5','pay_prod_indicator',
'pay_natl_drug_code','pay_name_drug','pay_name_device','pay_man_gpo_name','pay_man_gpo_reg_id','pay_total_payment','pay_date_payment','pay_num_payments',
'pay_form_payment','pay_nature_payment','pay_city_travel','pay_state_travel','pay_country_travel',
'pay_ownership_indicator','pay_third_party_payment','pay_third_party_name','pay_charity','pay_third_party_is_covered_recip',
'pay_delay_in_pub','pay_contextual_info'] ;

var nm_investments = ['inv_first','inv_middle','inv_last','inv_suffix','inv_address1','inv_address2','inv_city','inv_state','inv_zipcode','inv_country',
'inv_province','inv_postal_code','inv_email','inv_physician_type','inv_npi','inv_taxonomy','inv_','inv_lic_no1','inv_lic_state2','inv_lic_no2',
'inv_lic_state3','inv_lic_no3','inv_lic_state4','inv_lic_no4','inv_lic_state5','inv_lic_no5','inv_man_gpo_name',
'inv_man_gpo_reg_id','inv_interest_held_by','inv_investment_amount','inv_investment_value','inv_investment_terms'] ;


function runIt( callback ) {
	console.log('connecting to cms portal...') ;
	request('https://portal.cms.gov/wps/myportal', function(error, response){
		if( error ) { throw error ; }
		if( response.statusCode !== 200 ) { return callback('failed to connect to cms.gov') ; }
		
		console.log('Accepting terms..') ;

		r({
			uri: 'https://eidm.cms.gov/EIDMLoginApp/userlogin.jsp',
			method: 'POST',
			form: {
				terms: 'accept',
				termsaccepted: 'I Accept'			
			}
		}, function( err, response ){
			if( err ) { throw err ; }
			if( response.statusCode !== 200 ) { return callback('post to I accept: ' + response.statusCode) ; }

			console.log('Logging in...') ;

			r({
				uri: 'https://eidm.cms.gov/oam/server/auth_cred_submit',
				method: 'POST',
				form: {
					userid: argv.user,
					password: argv.password,
					submit: 'Log In'
				}
			}, function(err, response){
				if( err ) { return callback( err ) ; }

				if( response.statusCode === 302 ) {
					r(response.headers['location'], function(err, response){
						if( err ) { throw err ; }
						if( response.statusCode !== 200 ) { return callback('response to get of provided location: ' + response.statusCode) ; }

						console.log('Successfully logged in....') ;
						console.log('selecting dropdown for open payments portal...') ;
						//$ = cheerio.load(body); 
						var href = $('a.navflySub2[href*="/wps/myportal/cmsportal/op/op_reg"]').attr('href') ;
						if( !href ) { 
							var msg = '' ;
							$('#errorMessages p').each( function(idx, p){
								msg += $(p).html() ;
							}) ;
							return callback(msg || 'did not get expected welcome page') ; 
						}

						r('https://portal.cms.gov' + href, function(err, response, body){
							if( err ) { throw err ; }
							if( response.statusCode !== 200 ) { throw new Error('response navigating to open payments page %d', response.statusCode); }

							if( -1 !== body.indexOf('This portlet is unavailable.') ) { 
								return callback('Darn, CMS open payment system is down :('); 
							}

							debug('selecting review and dispute...') ;
							//var $ = cheerio.load(body) ;
							var form = $('.cmsPortletContainerThin form') ;
							if( !form ) { throw new Error('cant find form') ; }

							var a = form.find('div.top-nav ul li').eq(1).find('a') ;
							if(!a) { debug('couldnt find anchor') ; }
							
							var formData = {} ;
							formData[a.attr('id')] = a.attr('id') ;
							formData[form.attr('id')] = form.attr('id') ;
							formData['javax.faces.ViewState'] = 'j_id1:j_id2' ;

							r({
								uri: 'https://portal.cms.gov' + form.attr('action'),
								method: 'POST',
								form: formData
							}, function(err, response, body) {
								if( err ) { return callback( err ) ; }

								//var $ = cheerio.load(body) ;
								var options = $('.ProfileResults .FormRow.grid_400').eq(0).find('select option') ;
								console.log('Found ' + (options.length -1) + ' physicians:' ) ;

								var hcps = [] ;
								options.each( function(idx){
									if( 0 === idx ) { return ; }
									debug($(this).html()) ;
									console.log($(this).html()); 
									hcps.push({
										name: $(this).html(),
										org: $(this).attr('value'), 
										data: [],
										transactions: []
									}) ;
								}) ;

								getAllHcpData( hcps, body, function( err, hcps ) {
									if( err ) { return callback( err ) ; }
									writeHcpData( hcps, function() {
										callback(null) ;
									} ) ;
								}) ;
							}) ;
						}) ;
					}) ;
				}
			}) ;
		}) ;
	}) ;
}

function getOnePageOfHcpData( hcp, page, numPages, callback ) {
	console.log('retrieving data for page ' + page + ' of ' + numPages + ' for ' + hcp.name) ;

	var start = hcp.transactions.length ;
	var form = $('form') ;
	var tr = $('.CallOut.fullCallOut table.SearchDataTable > tbody > tr') ;

	tr.each( function() {

		var data = {} ;

		var colCount = nm_general.length ;

		for( var i = 0; i < colCount; i++ ) {
			if( 0 === i || 3 === i ) { continue ; }
			data[nm_general[i]] = $(this).find('td').eq(i).find('div').html() ;
		}

		var js = $(this).find('td').eq(colCount+1).find('a').attr('onclick') ;
		var re = /jsfcljs\(document.forms\['(\S+)'],{'(\S+)':'(\S+)'/ ;
		var arr = re.exec( js ) ;

		var obj = {} ;
		obj[arr[1]] = arr[1] ;
		obj[arr[2]] = arr[2] ;

		hcp.transactions.push({
			data: data,
			detail_form_data: obj 
		}) ;
	}) ;

	//get the detail for each transaction, coming back to the hcp summary page after each
	async.eachSeries( hcp.transactions.slice(start), function(txn, cb){
		debug('getting detail for %s, record id %s', txn.data.entity, txn.data.record_id ) ;

		var vs = form.find('input[name="javax.faces.ViewState"]').attr('value') ;
		r({
			uri: 'https://portal.cms.gov' + form.attr('action'),
			method: 'POST',
			form: merge( txn.detail_form_data, {'javax.faces.ViewState': vs})
		}, function(err){
			if( err ) { return cb(err) ; }

			var recordId = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > h1') ;
			if( null == recordId.html() ) {
				console.error('Error: could not find detail for ' + txn.data.entity + ' for recordId ' + txn.data.record_id) ;
				nm_payments.forEach( function(attr){
					txn.data[attr] = 'detail N/A' ;
				}) ;
				form = $('form') ;
				return cb(null) ;
			}

			debug('got detail page for %s', recordId.html().trim()) ;
			var div = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > span.textClass > .grid_625');
			var h2 = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > h2');
			if( h2.length === 4 && h2.eq(3).html().trim() === 'Research Related Information') {
				//research have 4 sections on the page:
				//Recipient Demographic Information; Associated Drug, Device, Biological, or Medical Supply Information; 
				//Recipient Demographic Information; Research Related Information
				var names = nm_research_teaching ;
				div.each( function(idx, d){
					var span = $(d).find('span') ;
					if( !!span && span.children.length && 3 === d.children.length) {
						var text = d.children[2].data.trim() ; 
						if( idx < names.length && names[idx] !== null ) { 
							txn.data[names[idx]] = text ; 
						}
						if( 0 === idx ) {
							debug('Recipient Type: %s', text) ;
							if( text !== 'Covered Recipient Teaching Hospital' ) {
								if( text === 'Covered Recipient Physician') {
									names = nm_research_covered_physician ;
								}
								else {
									names = nm_research_non_covered_entity ;
								}
							}
						}
					}
					else if( !!span ) {
						//search for list of items
						var li = $(d).find('ul li.listSameLine') ;
						if( !!li ) {
							var text2 = '' ;
							li.each( function(idx, item){
								text2 +=  $(item).html().trim() ;
							}) ;	
							txn.data[names[idx]] = text2 ;													
						}
					}
				}) ;
			} else if( h2.length === 4 ) {
				//payments have 4 sections on the page:
				//Recipient Demographic Information; Associated Drug, Device, Biological, or Medical Supply Information; 
				//Transfer of Value (Payment) Information; General Record Information
				div.each( function(idx, d){
					var span = $(d).find('span') ;
					if( !!span && span.children.length && 3 === d.children.length) {
						var text3 = d.children[2].data.trim() ; 
						if( idx < nm_payments.length && nm_payments[idx] !== null ) { 
							txn.data[nm_payments[idx]] = text3 ; 
						}
					}
					else if( !!span ) {
						//search for list of items
						var li = $(d).find('ul li.listSameLine') ;
						if( !!li ) {
							var text = '' ;
							li.each( function(idx, item){
								text +=  $(item).html().trim() ;
							}) ;	
							txn.data[nm_payments[idx]] = text ;													
						}
					}
				}) ;
			}
			else if( h2.length === 2 ) {
				//investments have 2 sections on the page:
				//Recipient Demographic Information; Ownership or Investment Information
				div.each( function(idx, d) {
					var span = $(d).find('span') ;
					if( !!span && span.children.length && 3 === d.children.length) {
						var text = d.children[2].data.trim() ; 
						if( idx < nm_investments.length && nm_investments[idx] !== null ) {
							txn.data[nm_investments[idx]] = text ;
						}
					}
					else if( !!span ) {
						//search for list of items
						var li = $(d).find('ul li.listSameLine') ;
						if( !!li ) {
							var text4 = '' ;
							li.each( function(idx, item){
								text4 +=  $(item).html().trim() ;
							}) ;	
							txn.data[nm_investments[idx]] = text4 ;													
						}
					}
				}) ;
			}
			else {
				console.error('unknown detail page type for recordId: ' + recordId.html().trim() + '!') ;
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
				uri: 'https://portal.cms.gov' + form.attr('action'),
				method: 'POST',
				form: fd
			}, function(err){
				if( err ) { return cb(err) ; }
				form = $('form') ;
				cb(null) ;
			}) ;
		}); 
	}, function(err){
		//completed getting one page of data
		//navigate to next page if there are more pages
		
		if( err ) { return callback(err) ; }

		debug('retrieved page %d of %d', page, numPages) ;

		if( page === numPages ) {
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
		}) ;
		
		form.find('select').each( function(){
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;

			if( -1 !== name.indexOf('reviewAndDisputeStatus') ) { return ; }

			if( -1 !== name.indexOf('EntriesReturned')) { value = 10 ; }
			formData[name] = value || null;

		}) ;

		form.find('input[type=text]').each( function(){
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;
			if( -1 !== name.indexOf('pagerGoText') ) { value = '' + (page+1) ; }

			formData[name] = value || null;

		}) ;
		var go = form.find('input[value=Go]') ;
		formData[go.attr('name')] = go.attr('value') ;

		var fd = serialize(formData) ;
		r({
			uri: 'https://portal.cms.gov' + form.attr('action'), 
			method: 'POST',
			form: fd
		}, function(err) {
			if( err ) { return callback(err) ; }
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
	},
	function() { 
		debug('got all data on page %d', page) ;
		return ++page <= numPages ;
	},
	function done(err){ 
		//final callback - got all detail from all pages - navigate back
		
		if( err ) {
			console.error('Error: ', err) ;
			throw err ;
		}
		debug('got all detail, returning to summary page with hcp listing') ;
		//debug('hcp.transactions: ', hcp.transactions )

		var form = $('form') ;
		var action = form.attr('action') ;

		var formData = {} ;
		var input = form.find('input') ;
		input.each( function() {
			var name = $(this).attr('name') ;
			var value = $(this).attr('value') ;
			var type = $(this).attr('type') ;

			if( type === 'checkbox' || type === 'image') { return ; }

			if( type === 'submit' && value !== 'Back')  { return ; }

			formData[name] = value || null;
		}) ;

		r({
			uri: 'https://portal.cms.gov' + action,
			method: 'POST',
			form: formData
		}, function(err, response, body) {
			if( err ) { return callback(err) ; }
			callback(null, body, hcp) ;
		}) ;
	}) ;

}

function updateFormData() {
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
		form: formData,
		uri: 'https://portal.cms.gov' + action,
		formId: formId
	} ;
}

function getAllHcpData( hcps, body, cb ) {

	var tasks = [] ;
	hcps.slice(8,9).forEach( function(hcp, idx){
		if( 0 === idx ) {
			tasks.push( function(callback) {
				var obj = updateFormData() ;
				obj.form[obj.formId+':orgSelected'] = hcp.org ;
				obj.form[obj.formId+':PaymentYear'] = '2014' ;
				console.log('retrieving data for ' + hcp.name) ;
				debug('getting data for %s', hcp.name) ;
				r({
					uri: obj.uri,
					method: 'POST',
					form: obj.form
				}, function(err, response, body){
					if( err ) {
						console.error('Error: ' + err) ;
						return callback(err) ;
					}
					if( !nodatafound( body ) ) {
						debug('getting hcp detail and then hitting back button') ;
						collectHcpDataAndNavigateBack( body, hcp, function(err, body, hcpData ) {
							if( err ) { return callback(err) ; }
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
				obj.form[obj.formId+':PaymentYear'] = '2014' ;

				console.log('retrieving data for ' + hcp.name) ;
				debug('getting data for %s:', hcp.name) ;
				r({
					uri: obj.uri,
					method: 'POST',
					form: obj.form
				}, function(err, response, body){
					if( err ) { return callback(err) ; }
					if( !nodatafound( body ) ) {
						collectHcpDataAndNavigateBack( body, hcp, function(err, body, hcpData ) {
							if( err ) { return callback(err) ; }
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

	async.waterfall( tasks, function( err ){
		if( err ) { return cb(err) ; }
		cb(null, hcps) ;
	}) ;
}
function nodatafound( body ) {
	return  -1 !== body.indexOf('There are no payments or other transfers of value') ;
}

function r( opts, callback ) {

	if( typeof opts === 'string') { opts = {uri: opts, method: 'GET'} ; }
	
	request(opts, function( err, response, body ) {
		if( !err && body ) { $ = cheerio.load(body) ; }

		if( argv.debug_files ) {
			logOutput( err, response, body, opts, callback ) ;
		} 
		else { 
			callback( err, response, body ) ;
		}
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
			},
			function mkdir(stats, cb) {
				if( stats && stats.isDirectory() ) { return cb(null) ; }
				if( stats ) { return cb(argv.debug_files + ' is not a directory') ; }
				fs.mkdir( argv.debug_files, function(err){
					if( err ) { return cb('failure creating debug directory: ' + err) ; }
					cb(null) ;
				}) ;
			},
			function writeBody(cb) {
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
				else {
					content = err ;
				}
				fs.writeFile(argv.debug_files + '/' + fileNum + '.html', content, function(err) {
					if( err ) { return cb(err) ; }
					cb(null);
				}) ;
			}

		], function(err){
			if( err ) { return callback( err ) ; }
			callback(err, response, body) ;
	}) ;
}

function writeHcpData( hcps, done ) {
	//debug('time to write hcp data: ', JSON.stringify(hcps)) ;
	var names = getAttributeName() ;

	async.eachSeries( hcps, function(hcp, cb){
		var filename = argv.outdir + '/' + hcp.name.toLowerCase().replace(/ /g,'_') + '.csv' ;
		debug('writing data for %s to %s', hcp.name, filename) ;
		var stream = fs.createWriteStream(filename);
		stream.once('open', function(){
			stream.write(names.join(',') + '\n') ;
			hcp.transactions.forEach( function(txn){
				names.forEach( function(name, idx) {
					if( 0 !== idx ) { stream.write(',') ; }

					if( txn.data[name] ) { 
						stream.write('"' + ent.decode( txn.data[name] ) + '"') ;
					}
					else { 
						stream.write('') ;
					}
				}) ;
				stream.write('\n') ;
			}) ;
			stream.end() ;
		}) ;
		stream.on('finish', function() {
			cb() ;
		}) ;
	}, function(err){
		if( err ) { console.log(err) ; }
		console.log('finished writing all files') ;
		done() ;
	}) ;
	return ;
}
function serialize(obj) {
	var str = [];
	for(var p in obj) {
		if (obj.hasOwnProperty(p)) {
			var value = obj[p] ;
			if( null !== value ) { 
				str.push(encodeURIComponent(p) + "=" + encodeURIComponent(value));
			}
			else {
				str.push(encodeURIComponent(p) + "=") ;
			}
		}
	}
	return str.join("&");
}

function getAttributeName() {
	return _.uniq(_.compact( nm_general.concat( nm_investments, nm_payments, nm_research_teaching, nm_research_non_covered_entity ) ) ); 
}
