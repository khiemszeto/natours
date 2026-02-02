const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const viewRouter = require('./routes/viewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const AppErrors = require('./utils/appErrors');
const globalErrorHandler = require('./controllers/errorControllers');

// Start express app
const app = express();

app.enable('trust proxy');

// SET UP THE SERVER RENDER ENGINE ( PUG )
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// 1)GLOBAL MIDDLEWARES

// SERVING STATIC FILES
app.use(express.static(path.join(__dirname, 'public'))); // Static files in express

// SETTING SECURITY HTTP HEADERS with Helmet
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'",
        'https://api.mapbox.com',
        'https://cdnjs.cloudflare.com',
        'https://js.stripe.com', // ✅ Stripe
      ],

      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://api.mapbox.com',
        'https://fonts.googleapis.com',
      ],

      fontSrc: ["'self'", 'https://fonts.gstatic.com'],

      imgSrc: [
        "'self'",
        'data:',
        'https://api.mapbox.com',
        'https://*.mapbox.com',
      ],

      connectSrc: [
        "'self'",
        'ws://127.0.0.1:*', // ✅ Parcel HMR
        'http://127.0.0.1:*',
        'https://api.mapbox.com',
        'https://events.mapbox.com',
      ],

      frameSrc: [
        "'self'",
        'https://js.stripe.com', // ✅ Stripe iframe
      ],

      workerSrc: ["'self'", 'blob:'],
    },
  }),
);

// DEVELOPMENT LOGGING
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // 3rd party middleware like our own middleware
}

// SETTING RATE LIMITING
// this object ia basically a middleware
const limiter = rateLimit({
  // max 150 req per hour
  max: 150,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});

//only use the limiter to the URLs with /api only
app.use('/api', limiter);

// BODY PARSER, reading data from body into req.body
app.use(express.json({ limit: '10kb' })); // middleware in the req and res
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// DATA SANTIZATION against NoSQL query injection
app.use(mongoSanitize());

// DATA SANTIZATION against XSS
app.use(xss());

// PREVENT PARAMETER POLUTION
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  }),
);

// middleware for text compression
app.use(compression());

// //HOW TO DEFINING OUR OWN MIDDLEWARE, the MIDDLEWARE APPLY TO EVERY SINGLE RESQUEST
// TEST MIDDLEWARE
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next(); // never forget to call next in the middleware
});

// 3) ROUTES

//// MOUNTING THE ROUTERS
app.use('/', viewRouter);
app.use('/api/v1/tours', tourRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

// MIDDLEWARE for handling errors
// .all run for all the VERBS
app.all('*', (req, res, next) => {
  next(new AppErrors(`Can't find ${req.originalUrl} on the server!`, 404));
  // if we put any param in the next(), it will skip all middlewares and go only to the global ERROR HANDLER MIDDLEWARE with this param
});

// global ERROR HANDLER MIDDLEWARE
app.use(globalErrorHandler);

module.exports = app;
