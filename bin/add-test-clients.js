#!/usr/bin/env node
const Promise = require('bluebird');
const models = require('../models');
const tokenUtils = require('../utils-token');

const testData = [
    ['Testing station #1', '__test__'],
    ['Testing station #2', 'OwO_NTUOSC_OwO']
];

models.Client.sync()
.then(Client => {
    let objs = testData.map(
        ([name, token]) => ({
            name: name, auth_code: tokenUtils.doHash(token)
        })
    );
    return Client.bulkCreate(objs);
}).then(insts => {
    return Promise.each(insts, inst => {
        console.log(inst.get({ plain: true }));
    });
}).then((oo) => {
    return models.db.close();
});
