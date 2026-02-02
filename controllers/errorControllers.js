const AppErrors = require('../utils/appErrors');

// ERRORs in production and development should be distinguished
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppErrors(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  //   const value = err.errorResponse.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const value = err.keyValue.name;

  const message = `Duplicated field value: ${value}. Please use another value!`;
  return new AppErrors(message, 400);
};

const handleValidationErrorDB = (err) => {
  // good to understand this line of code !!!
  const errors = Object.values(err.errors).map((el) => el.message);

  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppErrors(message, 400);
};

const handleJWTError = () =>
  new AppErrors('Invalid token. Please login agian!', 401);

const handleJWTExpired = () =>
  new AppErrors('Expired token. Please login agian!', 401);

const sendErrorDev = (err, req, res) => {
  // I) API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // II) RENDERED WEBSITE
  console.log('ERROR 🤯', err);
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  // I) API
  if (req.originalUrl.startsWith('/api')) {
    // A) Operational error, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }
    // B) Programming or other unknown error: don't leak error details
    // 1) Log error
    console.log('ERROR 🤯', err);
    // 2)Send generic message
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
    });
  }

  // II) RENDERED WEBSITE
  // Operational error, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message,
    });
  }

  //Programming or other unknown error: don't leak error details
  // 1) Log error
  console.log('ERROR 🤯', err);
  // 2)Send generic message
  return res.status(500).json({
    status: 'error',
    message: 'Please try agian later',
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    // let error = { ...err, message: err.message, name: err.name };
    let error = { ...err };

    error.message = err.message;
    error.name = err.name;
    error.statusCode = err.statusCode;
    error.status = err.status;
    error.isOperational = err.isOperational;

    if (error.name === 'CastError') {
      error = handleCastErrorDB(error);
    }

    if (error.code === 11000) {
      error = handleDuplicateFieldsDB(error);
    }

    if (error.name === 'ValidationError') {
      error = handleValidationErrorDB(error);
    }

    if (error.name === 'JsonWebTokenError') {
      error = handleJWTError();
    }

    if (error.name === 'TokenExpiredError') {
      error = handleJWTExpired();
    }

    sendErrorProd(error, req, res);
  }
};
