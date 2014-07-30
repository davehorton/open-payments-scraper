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
	console.error('usage: node app --user <username> --password <password> --outdir <folder>') ;
	return ;
}

debug('connecting to cms portal...')
request('https://portal.cms.gov/wps/myportal', function(error, response, body){
	if( error ) throw error ;
	if( response.statusCode !== 200 ) throw new Error('failed to connect to cms.gov') ;
	
	debug('Accepting terms..') ;

	r({
		uri: 'https://eidm.cms.gov/EIDMLoginApp/userlogin.jsp'
		,method: 'POST'
		,form: {
			terms: 'accept'
			,termsaccepted: 'I Accept'			
		}
	}, function( err, response, body ){
		if( err ) throw err ;
		if( response.statusCode !== 200 ) throw new Error('post to I accept: ' + response.statusCode) ;

		debug('Logging in...') ;

		r({
			uri: 'https://eidm.cms.gov/oam/server/auth_cred_submit'
			,method: 'POST'
			,form: {
				userid: argv.user
				,password: argv.password
				,submit: 'Log In'
			}
		}, function(err, response, body){
			if( err ) throw err ;

			if( response.statusCode === 302 ) {
				request(response.headers['location'], function(err, response, body){
					if( err ) throw err ;
					if( response.statusCode !== 200 ) throw new Error('response to get of provided location: ' + response.statusCode) ;

					debug('Successfully logged in!') ;
					debug('Selecting dropdown for open payments...') ;
					var $ = cheerio.load(body); 
					var href = $('a.navflySub2[href*="/wps/myportal/cmsportal/op/op_reg"]').attr('href') ;
					if( !href ) throw new Error('did not get expected welcome page') ;

					r('https://portal.cms.gov' + href, function(err, response, body){
						if( err ) throw err ;
						if( response.statusCode !== 200 ) throw new Error('response navigating to open payments page %d', response.statusCode);

						debug('selecting review and dispute...') ;
						var $ = cheerio.load(body) ;
						var form = $('.cmsPortletContainerThin form') ;
						if( !form ) throw new Error('cant find form') ;

						//debug('next POST will be to: %s', form.attr('action')) ;
						//debug('form html is ', form.html()) ;
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
							if( err ) throw err ;
							//debug('response to selecting review and dispute was %d', response.statusCode) ;
							//debug('response html: %s', body) ;
							//
							var $ = cheerio.load(body) ;
							var options = $('.ProfileResults .FormRow.grid_400').eq(0).find('select option') ;
							debug('Found %d physicians', options.length -1 ) ;

							var hcps = [] ;
							options.each( function(idx, el){
								if( 0 == idx ) return ;
								hcps.push({
									name: $(this).html() 
									,org: $(this).attr('value') 
									,data: []
								}) ;
							}) ;

							getAllHcpData( hcps, body, function( err ) {
								if( err ) throw err ;
								writeHcpData( hcps ) ;
							}) ;
						})
					}) ;
				}) ;
			}
		})
	}) ;
}) ;

function navigateBack(body, callback) {
	var $ = cheerio.load(body) ;
	var form = $('form') ;
	var button = form.find('input[value="Back"]') ;
	var hidden = form.find('input[type="hidden"]') ;
	var action = form.attr('action') ;

	//let's get all of the inputs
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
		callback(null, body) ;
	}) ;
}

function updateFormData( body ) {
	$ = cheerio.load(body) ;
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
					hcp.data = readHcpData( body ) ;
					if( hcp.data.length ) {
						debug('hitting back button')
						navigateBack( body, function(err, body ) {
							if( err ) return callback(err) ;
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

				//debug('getting data for %s: %s.....%s', hcp.name, loc.slice(0,70) + '...', fd['javax.faces.ViewState']) ;
				debug('getting data for %s:', hcp.name) ;
				r({
					uri: obj.uri
					,method: 'POST'
					,form: obj.form
				}, function(err, response, body){
					if( err ) return callback(err) ;
					hcp.data = readHcpData( body ) ;
					if( hcp.data.length ) {
						navigateBack( body, function(err, body ) {
							if( err ) return callback(err) ;
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
		cb(null) ;
	})
}
function getvs( body ) {
	var $ = cheerio.load( body ) ;
	return $('form input[name="javax.faces.ViewState"]').attr('value') ;
}
function readHcpData( body ) {

	if( -1 !== body.indexOf('There are no payments or other transfers of value') ) {
		debug('no payments found') ;
		return [] ;
	}

	var $ = cheerio.load(body) ;
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
					$ = cheerio.load(body) ;
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
	hcps.forEach( function(hcp){
		var filename = argv.outdir + '/' + hcp.name.toLowerCase().replace(/ /g,'_') + '.csv' ;
		debug('writing data for %s to %s', hcp.name, filename) ;
		var stream = fs.createWriteStream(filename);
		stream.once('open', function(fd){
			stream.write('organization,record id,category,form of payment,nature of payment,date,amount,delay in publication?,' + 
				'last modified,current standing,review status,date dispute initiated,last modified by,affirmed,history\n') ;
			hcp.data.forEach( function(payment){
				payment.forEach( function(val, idx) {
					if( 0 != idx ) stream.write(',') ;
					stream.write('"' + val + '"') ;
				})
				stream.write('\n') ;
			}) ;
			stream.end() ;
		}) ;
	}) ;
	return ;

}
