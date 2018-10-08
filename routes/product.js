var express = require('express');
var request = require('request');
var async = require('async');
var config = require('../configuration/config');
var router = express.Router();
const MagentoAPI = require('magento-node-api');
var MongoClient = require('mongodb').MongoClient;
var cron = require('node-cron');
const nodemailer = require('nodemailer');

var url = config.db.url;
var dbconn = null;

const magento = new MagentoAPI({
    host: config.magento.host,
    login: config.magento.username,
    pass: config.magento.password,
    path: config.magento.webservice
});

var localhostUrl = "http://localhost:" + config.express.port;

router.get('/cron', function(req, res, next) {
    magento.login(function(err, sessId) {
        if (err) {
            res.status(400).json({ status: "not able to connect with magento webservice." });
        }
    });

    finalResponse = []

    magento.init()
        .then(() => magento.catalog_product.list())
        .then(function(products) {
            async.series([
                function() {
                    products.forEach(function(product) {
                        magento.catalog_product.info(product.product_id)
                            .then(function(productInfo) {
                                magento.catalog_product_attribute_media.list(productInfo.product_id).then(function(media) {
                                    productInfo.media = media;
                                    productInfo.price = parseFloat(productInfo.price);
                                    MongoClient.connect(url, function(err, db) {
                                        var dbo = db.db(config.db.collection);
                                        if (err) res.status(500).send({ error: "Error occured while makeing conection to DB." });
                                        dbo.collection(config.db.product_table).update({ sku: product.sku }, { $set: productInfo }, { upsert: true }, function(err, res) {
                                            if (err) throw err;
                                            db.close();
                                        });
                                    });
                                });
                            });
                    });
                    res.json({ entryCount: products.length });
                }
            ]);
        })
});


router.get('/orders', function(req, res, next) {
    magento.login(function(err, sessId) {
        if (err) {
            console.log('Credentials verification failed:\n%j', err);
            return cb(err, { verified: false });
        } else {
            console.log("Login Successful - Session Id: " + sessId);
            return cb(null, { verified: true });
        }
    });
    finalResponse = []
        // List orders
    const params = { state: 'complete' };
    magento.init().then(function() {
        magento.sales_order.list(params).then(function(orders) {
            MongoClient.connect(url, function(err, db) {
                if (err) throw err;
                var dbo = db.db(config.db.collection);
                if (err) throw res.send({ error: "Error occured while makeing conection to DB." });
                async.series([
                    function() {
                        for (count = 0; count < orders.length; count++) {
                            orders[count].storename = config.magento.storename;
                            dbo.collection(config.db.order_table).update({ order_id: orders[count].order_id }, orders[count], { upsert: true });
                        }
                    }
                ]);
            });
        });
    }).then(function() {
        const params2 = { state: 'processing' };
        magento.sales_order.list(params2).then(function(orders) {
            MongoClient.connect(url, function(err, db) {
                if (err) throw err;
                var dbo = db.db(config.db.collection);
                if (err) throw res.send({ error: "Error occured while makeing conection to DB." });
                async.series([
                    function() {
                        for (count = 0; count < orders.length; count++) {
                            orders[count].storename = config.magento.storename;
                            dbo.collection(config.db.order_table).update({ order_id: orders[count].order_id }, orders[count], { upsert: true });
                        }
                    }
                ]);
            });
        });
    }).then(function() { res.json({}); });
});

router.get('/orders-product-map', function(req, res, next) {
    magento.login(function(err, sessId) {
        if (err) {
            console.log('Credentials verification failed:\n%j', err);
            return cb(err, { verified: false });
        } else {
            console.log("Login Successful - Session Id: " + sessId);
            return cb(null, { verified: true });
        }
    });

    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db(config.db.collection);
        if (err) throw res.send({ error: "Error occured while makeing conection to DB." });
        async.series([function() {
            orders = dbo.collection(config.db.order_table).find({ status: "processing" });

            try {
                orders.forEach(function(order) {
                    magento.init()
                        .then(() => magento.sales_order_invoice.info(order.increment_id)).then(function(invoice) {
                            invoice.items.forEach(function(product) {
                                try {
                                    dbo.collection(config.db.product_table).find({ sku: product.sku }).toArray(function(err, dbproducts) {

                                        dbproducts.forEach(function(dbproduct) {
                                            status = true;
                                            if ((typeof dbproduct.orders) == "undefined") {
                                                dbproduct.orders = new Array();

                                            } else {
                                                dbproduct.orders.forEach(function(invoiceDetails) {
                                                    if (invoiceDetails.invoice_id == invoice.increment_id) {
                                                        status = false;
                                                    }
                                                });
                                            }
                                            if (status) {
                                                dbproduct.orders.push({ invoice_id: invoice.increment_id, qty: product.qty, order: order });
                                            }

                                            dbo.collection(config.db.product_table).update({ product_id: dbproduct.product_id }, dbproduct, { upsert: true });

                                        })
                                    });
                                } catch (ex) {
                                    console.log("orders-product-map",error);
                                }
                            });
                        });
                });
            } catch (ex) { console.log(ex); }
        }, function() { db.close(); }]);
        res.json({});
    });
});

router.get('/orders-product-status', function(req, res, next) {
    magento.login(function(err, sessId) {
        if (err) {
            console.log('Credentials verification failed:\n%j', err);
            return cb(err, { verified: false });
        } else {
            console.log("Login Successful - Session Id: " + sessId);
            return cb(null, { verified: true });
        }
    });

    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db(config.db.collection);
        if (err) throw res.send({ error: "Error occured while makeing conection to DB." });
        async.series([function() {
            dbo.collection(config.db.order_table).find({ status: "complete" }).toArray(function(err, orders) {
                try {

                    orders.forEach(function(order) {
                        magento.init()
                            .then(() => magento.sales_order_invoice.info(order.increment_id)).then(function(invoice) {

                                invoice.items.forEach(function(product) {

                                    try {
                                        dbo.collection(config.db.product_table).find({ sku: product.sku }).toArray(function(err, dbproducts) {

                                            dbproducts.forEach(function(dbproduct) {
                                                var dbproductResult = dbproduct;
                                                status = true;
                                                if ((typeof dbproduct.orders) == "undefined") {
                                                    dbproduct.orders = new Array();
                                                } else {
                                                    count = 0;

                                                    dbproduct.orders.forEach(function(invoiceDetails) {
                                                        if (invoiceDetails.invoice_id == invoice.increment_id) {
                                                            dbproductResult.orders.splice(count, 1);
                                                        }
                                                        count++;
                                                    });
                                                }
                                                dbo.collection(config.db.product_table).update({ sku: dbproductResult.sku }, dbproductResult);
                                            });
                                        });
                                    } catch (ex) {
                                        console.log("product-order-status",error);
                                    }
                                });
                            });
                    });
                } catch (ex) { console.log(ex); }
            });
        }, function() { db.close(); }]);
        res.json({});
    });
});

router.get('/notification', function(req, res, next) {
    magento.login(function(err, sessId) {
        if (err) {
            console.log('Credentials verification failed:\n%j', err);
            return cb(err, { verified: false });
        } else {
            console.log("Login Successful - Session Id: " + sessId);
            return cb(null, { verified: true });
        }
    });

    productsBelowQuantity = [];

    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        var dbo = db.db(config.db.collection);
        if (err) throw res.send({ error: "Error occured while makeing conection to DB." });
        async.series([function() {
            dbo.collection(config.db.product_table).find({ "$and": [{ is_new: "N" }, { qty: { $lt: config.email.threshold_alert } }] }).toArray(function(err, products) {
                try {
                    if (products.length > 0) {
                        let transporter = nodemailer.createTransport({
                            host: config.email.host,
                            port: config.email.port,
                            secure: config.email.secure,
                            auth: {
                                user: config.email.user,
                                pass: config.email.pass
                            }
                        });
                        var emailBody = "\nList of products with lower quantities - \n";
                        products.forEach(function(product) {
                            emailBody = emailBody + product.sku + "\t " + product.qty + "\t " + product.name + "\n";
                        });

                        let mailOptions = {
                            from: config.email.sender,
                            to: config.email.to,
                            subject: 'Inventory Status',
                            text: emailBody
                        };

                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                console.log(error);
                            } else {
                                console.log('Message sent: %s', info.messageId);
                                console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
                            }
                        })

                    }
                } catch (ex) { console.log(ex); }
            });
        }, function() {
            db.close();
        }]);
        res.json({});
    });
});




cron.schedule(config.cron.products, function() {
    request.get((localhostUrl + "/product/cron"), function(error, response, body) {
        if (error) {
            console.log("product-cron",error);
        } else {
            console.log(response.statusMessage);
        }
    })
});

cron.schedule(config.cron.orders, function() {
    request.get((localhostUrl + "/product/orders"), function(error, response, body) {
        if (error) {
            console.log("product-orders",error);
        } else {
            console.log(response.statusMessage);
        }
    })
});

cron.schedule(config.cron.mapping, function() {
    request.get((localhostUrl + "/product/orders-product-map"), function(error, response, body) {
        if (error) {
            console.log("orders-product-map",error);
        } else {
            console.log(response.statusMessage);
        }
    })
});

cron.schedule(config.cron.status, function() {
    request.get((localhostUrl + "/product/orders-product-status"), function(error, response, body) {
        if (error) {
            console.log("order-product-status",error);
        } else {
            console.log(response.statusMessage);
        }
    })
});

cron.schedule(config.cron.notification, function() {
    if (config.email.notification) {
        request.get((localhostUrl + "/product/notification"), function(error, response, body) {
            if (error) {
                console.log(error);
            } else {
                console.log(response.statusMessage);
            }
        })
    }
});


module.exports = router;