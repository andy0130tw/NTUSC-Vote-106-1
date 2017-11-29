const Seq = require('sequelize');

const config = require('./config.json');

const db = new Seq(config.DB_DATABASE, config.DB_USERNAME, config.DB_PASSWORD, {
    dialect: config.DB_DIALECT,
    host: config.DB_HOSTNAME,
    define: {
        // no plural form please
        freezeTableName: true,
        // convert the default column names to `*_by`, `*_id`
        // to be differentiate column names with their decorations
        underscored: true
    },
    // to surpress warning
    operatorsAliases: false,
    // turn off logging if not debugging
    logging: (config.DB_LOGGING != null ? config.DB_LOGGING : config.DEBUG) ? console.log : false
});

const ENUM_LOG_LEVEL = Seq.ENUM('debug', 'verbose', 'info', 'warning', 'success', 'error');

const Client = db.define('client', {
    name:      { type: Seq.TEXT, allowNull: false },
    auth_code: { type: Seq.STRING(64), allowNull: false, unique: true },
    comment:   { type: Seq.TEXT },
    last_ping: { type: Seq.DATE(3) },
});

const Log = db.define('log', {
    level:     { type: ENUM_LOG_LEVEL, defaultValue: ENUM_LOG_LEVEL.debug },
    tag:       { type: Seq.STRING },
    content:   { type: Seq.TEXT },
});

const Ballot = db.define('ballot', {
    uid:       { type: Seq.STRING(24), allowNull: false, unique: true },
    serial:    { type: Seq.INTEGER },
    card_sec:  { type: Seq.TEXT },
    tx:        { type: Seq.STRING(64), allowNull: false, defaultValue: '!' },
    commit:    { type: Seq.BOOLEAN, defaultValue: false }
});

// Relations
Log.belongsTo(Client);
Ballot.belongsTo(Client);

module.exports = {
    db: db,
    Op: Seq.Op,

    Client: Client,
    Log: Log,
    Ballot: Ballot,
};