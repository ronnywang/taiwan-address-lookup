var parse_address = function(origin_address, callback) {
    // 先拿掉空白
    var address = origin_address.replace(/ /g, '');
    
    // 拿掉郵遞區號 TODO: 應該也要檢查郵遞區號跟鄉鎮關係
    address = address.replace(/^[0-9]+/, '');

    // 找出地址的行政區
    search_area(address, [callback], function(area_ids, word, argument){
        // 有行政區之後，再拿剩下的去找道路名稱
        var callback = argument[0];
        search_road(area_ids, word, function(result) {
                result.input = address;
                callback(result);
        });
    });
};

var area_name_map = null;

var get_area_data = function(argument, callback){
    // 已經抓過資料就不需要再抓了
    if (area_name_map !== null) {
        return callback(argument);
    }
    area_name_map = {};
    area_max_length = 0;
    // https://sheethub.com/area.reference.tw/中華民國行政區_map_名稱2014?format=csv
    area_versions = ['custom', '2014', '2010', '1984'];
    area_data = {};
    versions_loaded = 0;
    area_versions.map(function(version){
        get_csv('area_' + version + '.csv', function(records){
            var columns = records.shift();
            area_data[version] = records;
            versions_loaded ++;

            if (versions_loaded == area_versions.length) {
                area_versions.map(function(version){
                     area_data[version].map(function(rows){
                        var name = rows[0];
                        var id = rows[1];
                        if (area_name_map[name]) {
                                return;
                        }
                        area_name_map[name] = id;
                        area_max_length = Math.max(area_max_length, name.length);
                     });
                });
                callback(argument);
            }
        });
    });
};

var search_area = function(address, argument, callback){
    get_area_data([address, argument, callback], function(argument){
        var address = argument[0];
        var callback = argument[2];
        var argument = argument[1];
        // 先把一些罕見字替代掉
        var address = transferRareWord(address);
        address = address.replace(/^(福建省|台灣省|臺灣省)/, '');
        address = address.replace(/^(南部科學工業園區|新竹科學工業園區|中部科學工業園區|楠梓加工出口區)/, '');

        // 從 address 找出屬於哪個行政區
        while (true) {
            // 從長度最長的符合的來找
            for (var len = Math.min(area_max_length, address.length); len > 0; len --) {
                var word = address.substr(0, len);
                if (!area_name_map[word]) {
                    continue;
                }

                var area_ids = get_area_ids(area_name_map[word]);
                return callback(area_ids, address.substr(len), argument);
            }
            break;
        }
        throw '找不到行政區';
    });
};

var road_name_map = null;
var road_max_length = null;

var get_road_data = function(argument, callback){
    if (road_name_map) {
        return callback(argument);
    }

    get_csv('road.csv', function(records){
        var columns = records.shift();
        road_name_map = {};
        road_max_length = {};

        records.map(function(rows){
                var id = rows[0];
                var name = rows[1];
                if (!road_name_map[id]) {
                road_name_map[id] = {};
                road_max_length[id] = 0;
                }

                var std_name = transferArabicNumber(name);
                std_name = transferRareWord(std_name);
                var fuzzy_names = [];
                if (std_name.match(/[路街巷]/)) {
                    fuzzy_names.push(std_name.replace(/[路街巷]/g, 'x'));
                }
                road_name_map[id]['s' + std_name] = name; // 完整路名
                road_name_map[id]['sp' + std_name.substr(0, 1)] = true; // 字首拿來加速
                fuzzy_names.map(function(fuzzy_name){
                    road_name_map[id]['f' + fuzzy_name] = name; // 模糊比對路名
                    road_name_map[id]['fp' + fuzzy_name.substr(0, 1)] = true; // 模糊比對字首
                });
                road_max_length[id] = Math.max(road_max_length[id], std_name.length);
        });
        return callback(argument);
    });
};

var search_address = function(area_ids, road, origin_word, warnings, callback) {
    var word = origin_word;
    "０１２３４５６７８９".split('').map(function(wide_number, number){
        word = word.replace(wide_number, number);
    });
    word = word.replace(/ /g, '');
    word = word.replace(/[―－]/g, '-');
    
    word = word.replace(/︹(.+)︺/g, function(full, matches) { return matches; });
    word = word.replace(/（(.+)）/g, function(full, matches) { return matches; });
    word = word.replace(/\((.+)\)/g, function(full, matches) { return matches; });
    word = word.replace(/︵(.+)︶/g, function(full, matches) { return matches; });
   
    var must_matches = ['NUMBER', 'SECTION', 'LANE', 'ALLEY', 'SUB_ALLEY', 'TONG'];
    var terms = {};
    must_matches.map(function(key) {
        terms[key] = '';
    });
    if (area_ids.county_id) {
        terms['COUNTY'] = area_ids.county_id;
    }
    if (area_ids.town_id) {
        terms['TOWN'] = area_ids.town_id;
    }
    if (area_ids.village_id) {
        terms['VILLAGE'] = area_ids.village_id;
    }

    var matches;
    while (word.length) {
        if (matches = word.match(/^([0-9]+)-([0-9]*)號/)) {
            terms['NUMBER'] = parseInt(matches[1]) + "之" + parseInt(matches[2]) + "號";
            word = word.substr(matches[0].length);
        } else if (matches = word.match(/^臨([0-9]+)號/)) {
            terms['NUMBER'] = matches[1] + '號';
            word = word.substr(matches[0].length);
        } else if (matches = word.match(/^([0-9]+之)?([0-9]+號)(之[0-9]+)?(樓)?/)) {
            if (matches.length > 4 && matches[4] == '樓') {
                terms['NUMBER'] = matches[1] + matches[2];
            } else {
                terms['NUMBER'] = matches[0];
            }
            word = word.substr(matches[0].length);
        } else if (matches = word.match(/^([0-9]+)段/)) {
            terms['SECTION'] = matches[1] + "段";
            word = word.substr(matches[0].length);
        } else if (matches = word.match(/^([0-9]+)巷/)) {
            terms['LANE'] = matches[1] + "巷";
            word = word.substr(matches[0].length);
        } else if (matches = word.match(/^([0-9]+)弄/)) {
            terms['ALLEY'] = matches[1] + "弄";
            word = word.substr(matches[0].length);
        } else {
            // 如果地址已經抓到號的部分，表示後面應該都不重要了
            if (terms['NUMBER']) {
                break;
            }
            return callback('未知的地址元素 ' + word);
        }
    }

    var matches = [];
    get_csv("roads/" + area_ids.county_id + "-" + road + '.csv', function(records){
        var columns = records.shift();
        records.map(function(rows) {
            var values = {};
            columns.map(function(id, col) {
                values[id] = rows[col];
            });
            for (var id in terms) {
                if (terms[id] != values[id]) {
                    if (checkWarning(id, terms[id], values[id])) {
                        addWarning(values, id + " 欄位不相同");
                    } else {
                        return false;
                    }
                }
            }
            if (warnings.length) {
                addWarning(values, $arnings);
            }
            matches.push(values);
        });

        if (matches.length == 1) {
            return callback(matches);
        }

        // 如果符合超過一個的話，加上警告
        if (matches.length > 1) {
            var no_warning_matches = matches.filter(function(v) { return !v['warnings']; });
            if (no_warning_matches.length == 1) {
                return callback(no_warning_matches);
            }
            addWarning(matches[0], '吻合地址超過一個');
            return callback(matches);
        }

        // 找出號碼最接近的或是沒有之幾的 1. 門牌最接近的
        var fuzzy_matches = [null, null];
        records.map(function(rows){
            var values = {};
            columns.map(function(id, col) {
                values[id] = rows[col];
            });
            var fuzzy_type = 0;
            for (var k in terms) {
                var v = terms[k];
                if ('NUMBER' == k) {
                    var check_number = parseInt(getCleanNumber(v));
                    var query_number;
                    try {
                        query_number = parseInt(getCleanNumber(values[k]));
                    } catch (e) {
                        console.log('warning: ' + e);
                        return;
                    }
                    values['clean_number'] = query_number;

                    if (null === fuzzy_matches[1] || Math.abs(query_number - check_number) < Math.abs(check_number - fuzzy_matches[1]['clean_number']) ) {
                        fuzzy_type = 1;
                    }
                } else if (v != values[k]) {
                    if (checkWarning(k, v, values[k])) {
                        addWarning(values, k + " 欄位不相同");
                    } else {
                        return;
                    }
                }
            }
            if (fuzzy_type == 1) {
                if (warnings) {
                    addWarning(values, warnings);
                }
                fuzzy_matches[1] = values;
            }
        });

        if (fuzzy_matches[1]) {
            addWarning(fuzzy_matches[1], '找不到號碼完全吻合，找最接近的');
            return callback([fuzzy_matches[1]]);
        }

        return callback("完全找不到吻合地址 " + origin_word);
    });
};

// 從 area_ids 行政區找到 word 是哪一條路
var search_road = function(area_ids, word, callback){
    get_road_data([area_ids, word, callback], function(argument){
        var area_ids = argument[0];
        var origin_word = argument[1];
        var callback = argument[2];

        if (!road_name_map[area_ids.county_id]) {
            throw "找不到 " + area_ids.county_id + " 縣市";
        }
        var terms = {};
        var word = origin_word;
        word = transferRareWord(word);
        word = transferArabicNumber(word);

        var matches;
        if (matches = word.match(/[0-9]+鄰/)) {
            terms['NEIGHBORHOOD'] = matches;
            word = word.substr(matches.length);
        }

        var c_id = area_ids.county_id;
        var road_names = road_name_map[c_id];

        var test_skiplen_and_len = function(checking_word, is_fuzzy, skip_len, len, success_callback) {
            var warnings = [];
            if (len === null) {
                len = Math.min(checking_word.length, road_max_length[c_id]);
            }
            // 如果 len 到 0 以下了都還找不到路名，那就多 skip 一個字元再試試看
            if (len < 0) {
                return test_skiplen_and_len(checking_word, is_fuzzy, skip_len + 1, null, success_callback);
            }

            // 如果有 skip_len 的話，就要加入警告
            if (skip_len > 0) {
                warnings = ["地址中多了 '" + checking_word.substr(0, skip_len) + "'"];
            }
            // 如果 skip_len 到底了還沒有東西的話，就要改用模糊比對，仍找不到就表示完全找不到了
            if (skip_len >= checking_word.length) {
                if (!is_fuzzy) {
                    return test_skiplen_and_len(checking_word, true, 0, null, success_callback);
                }
                return success_callback('找不到資料');
            }

            var word = checking_word.substr(skip_len);
            // 用字首找不到任何路就表示這個字不用找了
            if (is_fuzzy == false && !road_name_map[c_id]['sp' + word.substr(0, 1)]) {
                return test_skiplen_and_len(checking_word, is_fuzzy, skip_len + 1, null, success_callback);
            } else if (is_fuzzy == true && !road_name_map[c_id]['fp' + word.substr(0, 1)]) {
                return test_skiplen_and_len(checking_word, is_fuzzy, skip_len + 1, null, success_callback);
            }
            var w = word.substr(0, len);
            // 找不到符合路名的話，長度減一再試試看
            if (!is_fuzzy && 'undefined' == typeof(road_names['s' + w])) {
                return test_skiplen_and_len(checking_word, is_fuzzy, skip_len, len - 1, success_callback);
            } else if (is_fuzzy && 'undefined' == typeof(road_names['f' + w])) {
                return test_skiplen_and_len(checking_word, is_fuzzy, skip_len, len - 1, success_callback);
            }

            search_address(area_ids, road_names['s' + w], word.substr(len), warnings, function(ret){
                if (null === ret || 'string' === typeof(ret)) {
                    return test_skiplen_and_len(checking_word, is_fuzzy, skip_len, len - 1, success_callback);
                } else {
                    return success_callback(ret);
                }
            });
        };

        return test_skiplen_and_len(word, false, 0, null, callback);
    });
};

var get_csv = function(url, callback){
    var oReq = new XMLHttpRequest();
    oReq.onload = function(){
        var text = this.responseText.replace(/\s+$/m, '');
        callback(text.split("\n").map(function(line) { return line.split(","); }));
    };
    oReq.open("get", "//ronnywang.github.io/taiwan-address-data/" + url, true);
    oReq.send();
};

// 轉換罕字成常用字
var transferRareWord = function(word){
    var map = {
        '衞': '衛',
        '臺': '台',
        '巿': '市',
        '舘': '館',
        '羣': '群',
        '峯': '峰',
    };

    for (var old_word in map) {
        word = word.replace(old_word, map[old_word]);
    }
    return word;
};

// 從行政區代碼找到完整的縣市、鄉鎮、村里代碼
var get_area_ids = function(id){
    var ret = {county_id: '', town_id: '', village_id: ''};
    if (id.length == 11) {
        ret.village_id = id;
    } else if (id.length == 7) {
        ret.town_id = id;
    } else {
        ret.county_id = id;
    }

    if (ret.village_id) {
        ret.town_id = ret.village_id.substr(0, 7);
    }

    if (ret.town_id) {
        if (ret.town_id.match(/^(10|09)/)) { // 福建省或臺灣省縣市
            ret.county_id = ret.town_id.substr(0, 5);
        } else if (ret.town_id.match(/^6/)) { // 直轄市
            ret.county_id = ret.town_id.substr(0, 2);
        }
    }

    if (ret.county_id == '10003') { // 舊桃園縣
        ret.county_id = '68';
        if (ret.town_id) {
            ret.town_id = '680' + ret.town_id.substr(5, 2) + '00';
        }
        if (ret.village_id) {
            ret.village_id = ret.town_id + '-' + ret.village_id.split('-')[1];
        }
    }

    return ret;
};

var chineseNumberToArbicNumber = function(word){
    var chi_number_map = {'○': 0, '一': 1, '二':2 , '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '廿': 20};

    var chars = word.split('');
    if (chars.length == 1) {
        return chi_number_map[chars[0]];
    } else if (chars.length == 2 && chars[0] == '廿') {
        return 20 + chi_number_map[chars[1]];
    } else if (chars.length == 2 && chars[0] == '十') {
        return 10 + chi_number_map[chars[1]];
    } else if (chars.length == 2 && chars[1] == '十') {
        return 10 * chi_number_map[chars[0]];
    } else if (!word.match('十')) {
        s = '';
        for (var i = 0; i < chars.length; i++) {
            s += chi_number_map[chars[i]];
        }
        return s;
    } else if (chars.length == 3 && chars[1] == '十') {
        return chi_number_map[chars[0]] * 10 + chi_number_map[chars[2]];
    }

    throw word + "無法轉成阿拉伯數字";
};

// 把字串中的中文數字轉成阿拉伯數字
var transferArabicNumber = function(word) {
    return word.replace(/[○一二三四五六七八九十廿]+/, function(m) {
        return chineseNumberToArbicNumber(m);
    });
};

var addWarning = function(values, warning) {
    if (!values['warnings']) {
        values['warnings'] = [];
    }
    if ('object' == typeof(warning)) {
        values['warnings'] = values['warnings'].concat(warning);
    } else {
        values['warnings'].push(warning);
    }
};

var checkWarning = function(column, query_value, db_value) {
    var warning_matches = ['TOWN', 'VILLAGE'];
    var warnings = [];
    if (warning_matches.indexOf(column) >= 0) {
        warnings.push(column + " 欄位不相同");
    }

    return warnings.length ? warnings : false;
};

var getCleanNumber = function(w){
    if (w.match(/^[0-9]+$/)) {
        return w;
    }
    var matches = w.match(/^(([0-9]+)之)?([0-9]+)號/);
    if (!matches) {
        throw "不合法的號 {$w}";
    }
    if (matches[2]) {
        return matches[2];
    } else if (matches[3]) {
        return matches[3];
    }
    throw "不合法的號 {$w}";
};
