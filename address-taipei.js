var to_wide_num = function(str){
    var num_map = '０１２３４５６７８９'.split('');
    return str.replace(/[0-9]/g, function(m) {
        return num_map[m];
    });
};
var taipei_query_function = function(parse_address_result, callback){
    var url = 'http://www.houseno.tcg.gov.tw/ASP_FRONT_END/main_.asp';
    var now = new Date;
    var section_map = {'': '', '1段': '一', '2段': '二', '3段': '三', '4段' : '四', '5段': '五', '6段': '六', '7段': '七'};
    if (parse_address_result.NUMBER.match(/號之/)) {
        ttrnum = to_wide_num(parse_address_result.NUMBER.split('號之')[0]);
	ttrg = to_wide_num(parse_address_result.NUMBER.split('號之')[1]);
    } else {
	ttrnum = to_wide_num(parse_address_result.NUMBER.replace(/號$/, ''));
	ttrg = '';
    }
    var params = 'ttrstyle=2&yy=105&mm=03&dd=16&s_yy=&s_mm=&s_dd=&e_yy=&e_mm=&e_dd=&ttrarea=' +
        '&ttrstreet=' + encodeURIComponent(parse_address_result.ROAD) +
        '&ttrsection=' + encodeURIComponent(section_map[parse_address_result.SECTION]) + 
        '&ttrshi=' + encodeURIComponent(to_wide_num(parse_address_result.LANE.replace(/巷$/, ''))) +
        '&ttrlo=' +
        '&ttrtemp=' +
        '&ttrnum=' + encodeURIComponent(ttrnum) +
        '&ttrfloor=' +
        '&ttrg=' + encodeURIComponent(ttrg) +
        '&ttryear=' +
        '&ttrmonth=&ttrday=&ettryear=&ettrmonth=&ettrday=';

    get_content('https://proxy.g0v.ronny.tw/proxy.php?url=' + encodeURIComponent(url + '?' + params), function(tpe_result){
        tpe_result = tpe_result.substring(tpe_result.indexOf('<table id="tb_no_border">'));
        var matches = tpe_result.match(/SET_RED_POINT\(([0-9.]*),([0-9.]*),2,'([^\']*)'\)" >\s*<font color="#880000">([^<]*)<\/font>\s+<font color="#008800">([^<]*)<\/font>\s+<font color="#000088">([^<]*)<\/font>\s+<font color="#000000">([^<]*)<\/font>\s+<\/a>\s+<td width=20%><font color="#000000">([^<]*)/);
        if (!matches) {
            return callback({error: true, message: '找不到地址資訊', url: url + '?' + params});
        }
        var result = {};
        result = {};
        result['TOWN'] = area_name_map[parse_address_result['COUNTY_NAME'] + matches[4]];
        result['VILLAGE'] = area_name_map[parse_address_result['COUNTY_NAME'] + matches[4] + matches[5]];
        result['TOWN_NAME'] = area_name[result['TOWN']];
        result['VILLAGE_NAME'] = area_name[result['VILLAGE']];
        result['QUERY_URL'] = url + '?' + params;
        lng_lat = proj4('EPSG:3826', 'WGS84', [parseFloat(matches[1]), parseFloat(matches[2])]);
        result['lng'] = lng_lat[0];
        result['lat'] = lng_lat[1];
        result['NEIGHBORHOOD'] = matches[6];
	result['RESULT_ADDRESS'] = matches[7].replace(/&nbsp;/g, '');
	result['ADDRESS_TIME'] = matches[8].replace(/&nbsp;/g, '');
        callback(result);
    });
};

city_query_function[63] = taipei_query_function;
proj4.defs('EPSG:3826', "+title=TWD97 TM2+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=公尺 +no_defs");

