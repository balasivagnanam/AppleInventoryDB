var config = {};

config.express = {
    port: "4502"
}

config.cron = {
    products: "0 22 * * *",
    orders: "5 22 * * *",
    mapping: "10 22 * * *",
    status: "15 22 * * *",
    notification: "20 22 * * *"
}

config.email = {
    notifications: true, //Make it true on last Inventory DB node instance to avoid multiple emails
    sender: "admin@synergoshop.com",
    to: "kadam.kishore@gmail.com, bala@mindlens.com.sg",
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    user: 'dmnlo7m3pwnapdf5@ethereal.email',
    pass: 'zvCbKsJGFS4QCc8gnw',
    threshold_alert: 5
}

config.magento = {
    storename: "AppleSG",
    username: "synergoapp",
    password: "synergo1",
    host: "one.synergoshop.com",
    webservice: "/api/xmlrpc"
};


config.db = {
    "url": "mongodb://localhost:27017",
    "collection": "SynergoDB",
    "product_table": "product",
    "order_table": "orders",
}

module.exports = config;