var config = require('./configuration/config');
var express=require('express');
var path=require('path');
var bodyParser=require('body-parser');

// In above three line we import the required packages

var index=require('./routes/index');
var api=require('./routes/product');

// index and api object contain the path of routing files for our application

var port=config.express.port;
var app=express();

//Define the port and create an object of express class

app.set('view engine','ejs');


// define the view engine and set the path for views files

app.engine('html',require('ejs').renderFile);
//Register given template engine callbac function as extension



// Defien the path for the static files like image, css and js files

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
// Define the middleware to parse the data from URL request and requesy body

app.use('/',index);
app.use('/product',api);
app.use('*',index);
// define the middleware for routing

//app.listen(port,function(){
//    console.log('Server Started At '+port);
//})

app
.listen(process.env.PORT || 4502)