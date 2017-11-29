const Promise = require('bluebird');
const rp = require('request-promise');
const iconv = require('iconv-lite');
const xml2js = require('xml2js');
const parseXML = Promise.promisify(xml2js.parseString);

const config = require('./config.json');

function toQueryBody(str) {
    return `<?xml version="1.0" encoding="big5"?>
<STUREQ>
  <Vers>1.00</Vers>
  <UID>${config.FOREIGN_UID}</UID>
  <PASSWORD>${config.FOREIGN_PASSWORD}</PASSWORD>
  <STUID>${str}</STUID>
</STUREQ>`;
}

function extractQueryResp(buf) {
    const xmlStr = iconv.decode(buf, 'big5');
    return parseXML(xmlStr).then(json => {
        const obj = {};
        Object.keys(json.STUINFO).forEach((k) => {
            obj[k.toLowerCase()] = json.STUINFO[k][0];
        });
        obj.incampus = (obj.incampus == 'true');
        obj.webok = (obj.webok == 'OK');
        return obj;
    });
}

function query(s) {
    return rp.post(config.FOREIGN_URL, {
        headers: {
            'Content-Type': 'text/xml;charset=big5'
        },
        body: toQueryBody(s),
        encoding: null
    }).then((resp) => {
        return extractQueryResp(resp);
    });
}

module.exports = {
    query: query,
    toQueryBody: toQueryBody,
    extractQueryResp: extractQueryResp
};
