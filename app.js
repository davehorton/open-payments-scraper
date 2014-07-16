'use strict';

var scraper = require('./lib/open-payments-scraper')
,debug = require('debug')('open-payments')
,request = require('request')
,cheerio = require('cheerio') ;

var argv = require('minimist')(process.argv.slice(2));

if( argv.length < 2 || !argv.user || !argv.password ) {
	return usage() ;
}

var request = request.defaults({jar: true}) ;

debug('connecting to cms portal...')
request('https://portal.cms.gov/wps/myportal', function(error, response, body){
	if( error ) throw error ;
	if( response.statusCode !== 200 ) throw new Error('failed to connect to cms.gov') ;
	
	debug('Accepting terms..') ;

	request({
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

		request({
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

					request('https://portal.cms.gov' + href, function(err, response, body){
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

						request({
							uri: 'https://portal.cms.gov' + form.attr('action')
							,method: 'POST'
							,form: formData
						}, function(err, response, body){
							if( err ) throw err ;
							//debug('response to selecting review and dispute was %d', response.statusCode) ;
							//debug('response html: %s', body) ;
							//
							var $ = cheerio.load(body) ;
							var options = $('.ProfileResults .FormRow.grid_400').eq(0).find('select option') ;
							debug('Found %d physicians', options.length -1 ) ;


							//find form level data we'll need
							var button = $('input[value="Show Records"]') ;
							var buttonName = button.attr('name') ;
							var form = button.closest('form') ;
							var hidden = form.find('input[name="javax.faces.ViewState"]') ;

							var formData = {} ;
							var formId = form.attr('id')
							formData[formId] = formId ;
							formData[buttonName] = 'Show Records' ;
							formData['javax.faces.ViewState'] = hidden.attr('value') ;

							options.each( function(idx, el){
								if( 0 == idx ) return ;

								var name = $(this).html() ;
								var value = $(this).attr('value') ;
								debug('Getting data for %s...', name) ;

								formData[formId+':orgSelected'] = value ;
								formData[formId+':PaymentYear'] = '2013' ;

								//debug('sending POST with form data: ', formData) ;
								//debug('sending POST with uri: %s', 'https://portal.cms.gov' + form.attr('action') )

								request({
									uri: 'https://portal.cms.gov' + form.attr('action')
									,method: 'POST'
									,form: formData
									//,headers: {
									//	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36'
									//}
								}, function(err, response, body){
									if( err ) throw error ;

									var $ = cheerio.load(body) ;
									var page = 1 ;
									var pages = $('.CallOut.fullCallOut table.SearchDataTable tfoot table table tbody tr td')
									.eq(2)
									.find('span').html() ;
									var pos = pages.indexOf(' of ') ;
									pages = parseInt( pages.slice(pos+4)) ;

									debug('%s has %s of payment records', name, 1 == pages ? '1 page': (pages + ' pages')) ;

									do {
										var tr = $('.CallOut.fullCallOut table.SearchDataTable > tbody > tr') ;
										debug('page %d has %d open payment records', page, tr.length)

										tr.each( function(idx) {
											var company = $(this).find('td').eq(1).find('div') ;
											var amount = $(this).find('td').eq(8).find('div') ;
											debug('%s: %s', company.html(), amount.html())
											//if( 8 == idx ) debug($(this).html())
										}) ;

										if( page++ < pages ) {
											//TODO: get next page
										}
									} while( page <= pages ) ;

								}) ;
							}) ;
						})


					})
				}) ;
			}

		})
	}) ;
}) ;


function usage() {
	console.error('usage: node app --user <username> --password <password>') ;
}
