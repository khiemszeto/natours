const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');

const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppErrors = require('../utils/appErrors');
const Email = require('../utils/email');
const { response } = require('express');

const signToken = (id) =>
  jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRED_IN,
  });

const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRED_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  // just remove the password from the output res body, not deleting it in DB
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  //   console.log(url);

  await new Email(newUser, url).sendWelcome();

  createAndSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exists
  if (!email || !password) {
    return next(new AppErrors('Please provide email and password', 400));
  }

  // 2) Check if the user exists & password is correct
  // if in mongoDB, a field is not select to present, if we want to get that field we add '+' before the field name
  const user = await User.findOne({ email: email }).select('+password');
  if (!user) {
    return next(new AppErrors('Incorrect email or password', 401));
  }

  const correctPassword = await user.correctPassword(password, user.password);
  if (!correctPassword) {
    return next(new AppErrors('Incorrect email or password', 401));
  }

  // 3) If everything is ok, send token to client
  createAndSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'dummylogouttext', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    status: 'success',
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting the token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  // 2) Verify the token
  if (!token) {
    return next(
      new AppErrors('You are not logged in! Please login to get access'),
      401,
    );
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if the user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser)
    return next(
      new AppErrors('The user belonging to this token no longer exists', 401),
    );

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppErrors('User has changed the password! Please login again.', 401),
    );
  }

  // 5) IF EVERYTHING is OK, GRANT ACCESS TO PROTECTD ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Only for rendering pages, no errors !
exports.isLoggedIn = async (req, res, next) => {
  // verify the token
  if (req.cookies.jwt) {
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET,
      );

      // 2) Check if the user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) return next();

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // 4) THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (error) {
      return next();
    }
  }
  next();
};

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    // roles is an array ['admin', 'lead-guide].
    if (!roles.includes(req.user.role)) {
      return next(
        new AppErrors('You do not have permission to perform this action', 403),
      );
    }

    next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTED email
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new AppErrors('There is no user with this email', 404));
  }

  // 2) Generate the random token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send the token to user's email
  const resetURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;

  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    console.error('EMAIL ERROR 💥', err);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppErrors(
        'There was an error sending the email. Please try again later!',
        500,
      ),
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If the token is not expired, then set the new password
  if (!user) return next(new AppErrors('Token expired or invalid!', 400));

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetExpires = undefined;
  user.passwordResetToken = undefined;
  await user.save();

  // 3) Update changedPassword property for the current user
  // 4) Log the user in, send the JWT to this client
  createAndSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get the user from the DB
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if the current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppErrors('Your current password is wrong', 401));
  }
  // 3) If the password is correct, update the password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log the user in, send JWT
  createAndSendToken(user, 200, res);
});
