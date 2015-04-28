var request = require('request').defaults({jar: true, strictSSL: false})  ;
var cheerio = require('cheerio') ;
var async = require('async') ;
var debug = require('debug')('open-payments') ;
var merge = require('merge') ;
var argv = require('minimist')(process.argv.slice(2)) ;
var fs = require('fs') ;
var _ = require('underscore') ;
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

var fields = {
	'Physician&apos;s First Name:' : 'first',
	'Physician Middle Name:' : 'middle',
	'Physician Last Name:' : 'last',
	'Physician Name Suffix:' : 'suffix',
	'Physician Business Street Address, Line 1:' : 'address1',
	'Physician Business Street Address, Line 2:' : 'address2',
	'Physician City:': 'city',
	'Physician State:': 'state',
	'Physician Zip Code:': 'zipcode',
	'Physician Country:': 'country',
	'Physician Province:': 'province',
	'Physician Postal Code:': 'postal_code',
	'Physician Email Address:': 'email',
	'Physician Primary Type:': 'physician_type',
	'Physician NPI:': 'npi',
	'Physician Taxonomy Code:': 'taxonomy',
	'Physician License State:' : 'lic_state',
	'Physician License Number:': 'lic_no',
	'Applicable Manufacturer or Applicable GPO Reporting Ownership Name:': 'man_gpo_name_reporting_ownership',
	'Applicable Manufacturer or Applicable GPO Reporting Ownership Registration ID:': 'man_gpo_reg_id_reporting_ownership',
	'Interest Held By:': 'interest_held_by',
	'Dollar Amount Invested:': 'investment_amount',
	'Value of Interest:': 'investment_value',
	'Terms of Interest:': 'investment_terms',
	'Product Indicator:' :'prod_indicator',
	'Total Amount of Payment:': 'total_payment',
	'Date of Payment:': 'date_payment',
	'Number of Payments Included in Total Amount:' : 'num_payments',
	'Form of Payment or Transfer of Value:': 'form_payment',
	'Nature of Payment or Transfer of Value:': 'nature_payment',
	'City of Travel:': 'city_travel',
	'State of Travel:': 'state_travel',
	'Country of Travel:': 'country_travel',
	'Physician Ownership Indicator:': 'ownership_indicator',
	'Third Party Payment Recipient Indicator:': 'third_party_payment',
	'Name of Third Party Entity Receiving Payment or Transfer of Value:': 'third_party_name',
	'Charity Indicator:': 'charity',
	'Third Party Equals Covered Recipient Indicator:': 'third_party_is_covered_recip',
	'Delay in Publication of Research Payment Indicator:': 'delay_in_pub',
	'Contextual Information:': 'contextual_info',
	'Covered Recipient Type:': 'covered_recipient_type',
	'Recipient Type:': 'recipient_type',
	'Physician First Name:': 'first',
	'Recipient Business Street Address, Line 1:': 'recipient_address1',
	'Recipient Business Street Address, Line 2:': 'recipient_address2',
	'Recipient City:': 'recipient_city',
	'Recipient State:': 'recipient_state',
	'Recipient Zip Code:': 'recipient_zipcode',
	'Recipient Country:': 'recipient_country',
	'Recipient Province:': 'recipient_province',
	'Recipient Postal Code:': 'recipient_postal_code',
	'Recipient Email Address:': 'recipient_email',
	'Applicable Manufacturer or Applicable GPO Making Payment Name:': 'man_gpo_name_making_payment',
	'Applicable Manufacturer or Applicable GPO Making Payment Registration ID:': 'man_gpo_reg_id_making_payment',
	'Non-Covered Recipient Entity Name:': 'non_covered_entity',
	'Product indicator:': 'prod_indicator',
	'NDC of Associated Covered Drug or Biological:': 'ndc_code',
	'Name of Associated Covered Device or Medical Supply:': 'name_device',
	'Name of Associated Drug or Biological:': 'name_drug',
	'Total Amount of Research Payment:': 'total_research_payment',
	'Professional Salary Support:': 'salary_support',
	'Medical Research Writing or Publication:': 'research_writing_or_pub',
	'Patient Care:': 'patient_care',
	'Non-patient Care:': 'non_patient_care',
	'Overhead:': 'overhead',
	'Other:': 'other',
	'Pre-clinical Research Indicator:': 'pre_clinical_indicator',
	'Name of Study:': 'study_name',
	'Context of Research:': 'research_context',
	'ClinicalTrials.Gov Identifier:' : 'clinical_trial_identifier',
	'Research Information Link:': 'research_link',
	'Principal Investigator Covered Recipient Physician Indicator:': 'pi_covered',
	'National Drug Code of Associated Covered Drug or Biological:' : 'ndc_code',
	'Principal Investigator First Name:': 'pi_first',
	'Principal Investigator Middle Name:': 'pi_middle',
	'Principal Investigator Last Name:': 'pi_last',
	'Principal Investigator Suffix:': 'pi_suffix',
	'Principal Investigator Business Street Address, Line 1:': 'pi_address1',
	'Principal Investigator Business Street Address, Line 2:': 'pi_address2',
	'Principal Investigator Business City:':'pi_city',
	'Principal Investigator State:': 'pi_state',
	'Principal Investigator Zip Code:': 'pi_zipcode',
	'Principal Investigator Country:': 'pi_country',
	'Principal Investigator Province:': 'pi_province',
	'Principal Investigator Postal Code:': 'pi_postal_code',
	'Principal Investigator Physician Primary Type:': 'pi_primary_type',
	'Principal Investigator NPI:': 'pi_npi',
	'Principal Investigator Taxonomy Code:': 'pi_taxonomy',
	'Principal Investigator License State:': 'pi_lic_state',
	'Principal Investigator License Number:': 'pi_lic_no',
	'Covered Recipient Physician First Name:': 'covered_recipient_first',
	'Covered Recipient Physician Middle Name:': 'covered_recipient_middle',
	'Covered Recipient Physician Last Name:': 'covered_recipient_last',
	'Covered Recipient Physician Name Suffix:': 'covered_recipient_suffix',
	'Covered Recipient Physician NPI:': 'covered_recipient_npi',
	'Covered Recipient Physician Primary Type:': 'covered_recipient_primary_type',
	'Covered Recipient Physician Taxonomy Code:': 'covered_recipient_taxonomy',
	'Covered Recipient Physician License Number:': 'covered_recipient_lic_no',
	'Covered Recipient Physician License State:' : 'covered_recipient_lic_state',
	'Covered-Recipient Teaching Hospital Name:': 'covered_recipient_teaching_hospital_name',
	'Covered Recipient Teaching Hospital Taxpayer ID Number (TIN):': 'covered_recipient_teaching_hospital_tax_id'
} ;

var nm_general = [null,'entity','record_id','dispute_id','category','form_of_payment','nature_of_payment','transaction_date',
'amount','delay_in_pub','last_modified_date','current_standing','review_status','pi','pi_only',
'dispute_date','dispute_last','affirmed'] ;


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
function getLicCount( obj, colName ) {
	for( var i = 1; i < 6; i++ ) {

		if( !obj[colName + i] || 0 === obj[colName + i].length ) { return i;  }
	}
	return 5 ;
}

function saveItem( obj, prefix, name, value ) {

	switch( name ) {
		case 'pi_lic_state':
		case 'pi_lic_no':
		case 'lic_state':
		case 'lic_no':
		case 'covered_recipient_lic_state':
		case 'covered_recipient_lic_no':
			if( value && value.length > 0 ) {
				obj[ prefix + name + getLicCount( obj, name ) ] = value ;
			}
			return;

		default:
			break ;
	}
	var prop = prefix + name ;
	if( !( prop in obj ) ) {
		obj[prop] = value ;
	}
	else {
		debug('not saving %s as we already have a value', prop); 
	}
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
			if( 0 === i ) { continue ; }
			if( 'dispute_id' === nm_general[i] ) {
				data[nm_general[i]] = $(this).find('td').eq(i).find('div > a').html() ;
			}
			else if( 'review_status' === nm_general[i] || 'dispute_last' === nm_general[i] ) {
				data[nm_general[i]] = $(this).find('td').eq(i).html() ;				
			}
			else {
				data[nm_general[i]] = $(this).find('td').eq(i).find('div').html() ;
			}
		}

		//detail link
		var js = $(this).find('td').eq(colCount+1).find('a').attr('onclick') ;
		var re = /jsfcljs\(document.forms\['(\S+)'],{'(\S+)':'(\S+)'/ ;
		var arr = re.exec( js ) ;

		var obj = {} ;
		obj[arr[1]] = arr[1] ;
		obj[arr[2]] = arr[2] ;

		//dispute history link
		js = $(this).find('td').eq(colCount).find('a').attr('onclick') ;
		re = /jsfcljs\(document.forms\['(\S+)'],{'(\S+)':'(\S+)'/ ;
		arr = re.exec( js ) ;

		var obj2 ;
		if( arr ) {
			obj2 = {} ;
			obj2[arr[1]] = arr[1] ;
			obj2[arr[2]] = arr[2] ;
		}

		hcp.transactions.push({
			data: data,
			detail_form_data: obj,
			dispute_form_data: obj2
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
				form = $('form') ;
				return cb(null) ;
			}

			debug('got detail page for \'%s\'', recordId.html().trim()) ;
			if( 'Record ID: 215233110' === recordId.html().trim() ) {
				debug('got ansel record'); 
			}
			var div = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > span.textClass > .grid_625');
			var h2 = $('.GettingStarted > .LeftSide > .TabContent > .TextArea > .ProfileResults > h2');
			var prefix = '' ;
			if( h2.length === 4 && h2.eq(3).html().trim() === 'Research Related Information') {
				//research have 4 sections on the page:
				//Recipient Demographic Information; Associated Drug, Device, Biological, or Medical Supply Information; 
				//Recipient Demographic Information; Research Related Information
				prefix = 'res_' ;
			}
			else if( h2.length === 4 ) {
				//payments have 4 sections on the page:
				//Recipient Demographic Information; Associated Drug, Device, Biological, or Medical Supply Information; 
				//Transfer of Value (Payment) Information; General Record Information
				prefix = 'pay_' ;
			}
			else if( h2.length === 2 ) {
				//investments have 2 sections on the page:
				//Recipient Demographic Information; Ownership or Investment Information
				prefix = 'inv_' ;
			}
			if( !prefix ) { throw new Error('unknown detail page') ; }
			div.each( function(idx, d){
				if( $(d).hasClass('marginTp20') ) {
					//headings
					return ;
				}
				var span = $(d).find('span') ;
				try {

					if( !!span && span.children.length && 3 === d.children.length) {
						var text = d.children[2].data.trim() ; 
						var title = span.html().trim() ;
						if( !( title in fields ) ) { throw new Error('Unexpected/unknown detail field: ' + title) ; }

						//debug('saving %s', title) ;
						saveItem( txn.data, prefix, fields[title], text) ;
					}
					else if( !!span ) {
						//search for list of items
						var  title2 =  d.children[0].data.trim() ;
						var value = span.html().trim() ;
						if( title2 in fields ) {
							//debug('saving %s', title2) ;
							saveItem( txn.data, prefix, fields[title2], value) ;
							//txn.data[ prefix + fields[ title2 ] ] = value ;
						}
						else {
							var li = $(d).find('ul li.listSameLine') ;
							if( !!li ) {
								value = '' ;
								li.each( function(idx, item){
									value +=  $(item).html().trim() ;
								}) ;	
								var title3 = span.html().trim() ;
								if( !( title3 in fields ) ) {
									throw new Error('Unexpected/unknown detail field: \'' + title3 + '\': ' + value ) ;
								}
								//debug('saving %s', title3) ;
								saveItem( txn.data, prefix, fields[title3], value) ;
								//txn.data[ prefix + fields[title3] ] = value ;		
							}
						}
						//debug('nested deal: %s: %s', title2, value ) ;
					}
				} catch( e ) {
					console.error('Caught error: ' + e) ;
				}
			}) ;

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

				//back on general page

				//now get dispute detail, if exists 
				if( txn.dispute_form_data ) {
					var vs = form.find('input[name="javax.faces.ViewState"]').attr('value') ;
					r({
						uri: 'https://portal.cms.gov' + form.attr('action'),
						method: 'POST',
						form: merge( txn.dispute_form_data, {'javax.faces.ViewState': vs})
					}, function(err){
						if( err ) { return cb(err) ; }
						debug('got dispute history page for %s', recordId.html().trim()) ;

						//parse into one big object that we can jsonify
						var tr = $('.GettingStarted > .LeftSide > .TabContent > .TextArea table > tbody > tr');
						var disputes = [] ;
						tr.each( function(idx, row){
							var td = $(row).find('td') ;
							var d = {} ;
							td.each( function(i, data){
								var value = $(data).find('div').html() ;
								var nm ;
								switch(i) {
									case 0: nm = 'id'; break ;
									case 1: nm = 'status'; break ;
									case 2: nm = 'recordStatus'; break ;
									case 3: nm = 'amount'; break ;
									case 4: nm = 'paymentDate'; break ;
									case 5: nm = 'entity'; break ;
									case 6: nm = 'dateInitiated'; break ;
									case 7: nm = 'dateModified'; break ;
									case 8: nm = 'lastModifiedBy'; break ;
									case 9: nm = 'comments'; break ;
									default: 
										console.error('unexpected dispute column: ' + i) ;
										break ;
								}
								if( nm ) { d[nm] = value ; }
							}) ;
							disputes.push( d ) ;
						}) ;
						//debug('dispute JSON: %s', JSON.stringify(disputes));
						txn.disputeHistory = disputes ;

						form = $('form') ;
						formId = form.attr('id') ;
						button = form.find('.ButtonRow .leftSide input[type=submit]') ;
						vs = $('input[name="javax.faces.ViewState"]').attr('value') ;

						fd = {} ;
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

							//back on general page
							cb(null); 
						}) ;
					}) ;
				}
				else {
					cb(null) ;
				}
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
	//hcps.slice(9,10).forEach( function(hcp, idx){
	hcps.forEach( function(hcp, idx){
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
	return  !body || -1 !== body.indexOf('There are no payments or other transfers of value') ;
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

	//var names = getAttributeName(hcps) ;
	async.eachSeries( hcps, function(hcp, cb) {
		var filename = argv.outdir + '/' + hcp.name.toLowerCase().replace(/ /g,'_') + '.json' ;
		debug('writing data for %s to %s', hcp.name, filename) ;
		var stream = fs.createWriteStream(filename);
		stream.once('open', function() {
			var h = {
				name: hcp.name,
				org: hcp.org,
				transactions: _.map( hcp.transactions, function(txn) { 
					return {
						data: txn.data,
						disputes: txn.disputeHistory || []
					} ;
				}) 
			} ;
			stream.write(JSON.stringify(h)) ;
			/*
			stream.write(names.join('\t') + '\n') ;
			hcp.transactions.forEach( function(txn){
				names.forEach( function(name, idx) {
					if( 0 !== idx ) { stream.write('\t') ; }

					if( name === 'dispute_history' ) {
						if( txn.disputeHistory ) {
							stream.write( JSON.stringify(txn.disputeHistory).replace(/"/g,'\"').replace(/\t/g,'   ')) ;
						}
						else {
							stream.write( JSON.stringify( [] ) ) ;	
						}
					}
					else if( txn.data[name] ) { 
						stream.write('"' + ent.decode( txn.data[name] ) + '"') ;
					}
					else { 
						stream.write('') ;
					}
				}) ;

				stream.write('\n') ;
				*/
			
		//	}) ;
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
	return  [ 'entity', 'record_id', 'dispute_id', 'category', 'form_of_payment', 'nature_of_payment', 'transaction_date', 
	'amount', 'delay_in_pub', 'last_modified_date', 'current_standing', 'review_status', 'pi', 'pi_only', 'dispute_date', 
	'dispute_last', 'affirmed', 'inv_first', 'inv_middle', 'inv_last', 'inv_suffix', 'inv_address1', 'inv_address2', 'inv_city', 
	'inv_state', 'inv_zipcode', 'inv_country', 'inv_province', 'inv_postal_code', 'inv_email', 'inv_physician_type', 'inv_npi', 
	'inv_taxonomy', 
	'inv_lic_state1', 'inv_lic_no1', 
	'inv_lic_state2', 'inv_lic_no2', 
	'inv_lic_state3', 'inv_lic_no3', 
	'inv_lic_state4', 'inv_lic_no4', 
	'inv_lic_state5', 'inv_lic_no5', 
	'inv_man_gpo_name_reporting_ownership', 
	'inv_man_gpo_reg_id_reporting_ownership', 'inv_interest_held_by', 'inv_investment_amount', 'inv_investment_value', 
	'inv_investment_terms', 'pay_covered_recipient_type', 'pay_first', 'pay_middle', 'pay_last', 'pay_suffix', 'pay_recipient_address1', 
	'pay_recipient_address2', 'pay_recipient_city', 'pay_recipient_state', 'pay_recipient_zipcode', 'pay_recipient_country', 'pay_recipient_province', 
	'pay_recipient_postal_code', 'pay_recipient_email', 'pay_physician_type', 'pay_npi', 'pay_taxonomy', 
	'pay_lic_state1', 'pay_lic_no1', 
	'pay_lic_state2', 'pay_lic_no2', 
	'pay_lic_state3', 'pay_lic_no3', 
	'pay_lic_state4', 'pay_lic_no4', 
	'pay_lic_state5', 'pay_lic_no5', 
	'pay_prod_indicator', 'pay_ndc_code', 'pay_name_drug', 
	'pay_name_device', 'pay_man_gpo_name_making_payment', 'pay_man_gpo_reg_id_making_payment', 'pay_total_payment', 'pay_date_payment', 'pay_num_payments', 
	'pay_form_payment', 'pay_nature_payment', 'pay_city_travel', 'pay_state_travel', 'pay_country_travel', 'pay_ownership_indicator', 
	'pay_third_party_payment', 'pay_third_party_name', 'pay_charity', 'pay_third_party_is_covered_recip', 'pay_delay_in_pub', 
	'pay_contextual_info', 'res_recipient_type', 'res_non_covered_entity', 'res_prod_indicator', 'res_ndc_code', 'res_name_device', 
	'res_name_drug', 'res_man_gpo_name_making_payment', 'res_man_gpo_reg_id_making_payment','res_total_research_payment', 'res_date_payment', 'res_form_payment', 
	'res_salary_support', 'res_research_writing_or_pub', 'res_patient_care', 'res_non_patient_care', 'res_overhead', 'res_other', 
	'res_pre_clinical_indicator', 'res_delay_in_pub', 'res_study_name', 'res_research_context', 'res_clinical_trial_identifier', 
	'res_research_link', 'res_pi_covered', 'res_pi_first', 'res_pi_middle', 'res_pi_last', 'res_pi_suffix', 'res_pi_address1', 
	'res_pi_address2', 'res_pi_city', 'res_pi_state', 'res_pi_zipcode', 'res_pi_country', 'res_pi_province', 'res_pi_postal_code', 
	'res_pi_primary_type', 'res_pi_npi', 'res_pi_taxonomy', 
	'res_pi_lic_state1', 'res_pi_lic_no1',
	'res_pi_lic_state2', 'res_pi_lic_no2',
	'res_pi_lic_state3', 'res_pi_lic_no3',
	'res_pi_lic_state4', 'res_pi_lic_no4',
	'res_pi_lic_state5', 'res_pi_lic_no5',
	'res_covered_recipient_teaching_hospital_name', 'res_covered_recipient_teaching_hospital_tax_id', 
	'res_covered_recipient_first', 'res_covered_recipient_middle', 'res_covered_recipient_last', 
	'res_covered_recipient_suffix', 'res_recipient_address1','res_recipient_address2', 'res_recipient_city', 'res_recipient_state', 
	'res_recipient_zipcode', 'res_recipient_country', 'res_recipient_province', 'res_recipient_postal_code', 
	'res_recipient_email', 'res_covered_recipient_npi', 'res_covered_recipient_primary_type', 'res_covered_recipient_taxonomy', 
	'res_covered_recipient_lic_no1', 'res_covered_recipient_lic_state1', 
	'res_covered_recipient_lic_no2', 'res_covered_recipient_lic_state2', 
	'res_covered_recipient_lic_no3', 'res_covered_recipient_lic_state3', 
	'res_covered_recipient_lic_no4', 'res_covered_recipient_lic_state4', 
	'res_covered_recipient_lic_no5', 'res_covered_recipient_lic_state5', 
	'res_covered_recipient_lic_state',
	'dispute_history' ] ;
}
