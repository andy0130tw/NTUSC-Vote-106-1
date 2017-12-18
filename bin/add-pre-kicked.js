#!/usr/bin/env node
const Promise = require('bluebird');
const models = require('../models');
const tokenUtils = require('../utils-token');

const testData = require('../meta/pre-kicked-list.json');

models.Ballot.sync()
.then(Ballot => {
    let objs = testData.map(
        stuid => ({
            uid: stuid,
            tx: `!!!${tokenUtils.generateTxString()}!!!`,
            commit: 1
        })
    );
    return Ballot.bulkCreate(objs);
}).then(insts => {
    return Promise.each(insts, inst => {
        console.log(inst.get({ plain: true }));
    })
}).then(() => {
    return models.db.close();
});

