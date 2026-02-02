const mongoose = require('mongoose');
const slugify = require('slugify');
// const User = require('./userModel');

// Specify a schema in mongoDB with mongoose
const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'A tour must have a name'],
      unique: true,
      trim: true,
      maxlength: [40, 'A tour name must have less or equal than 40 chars'],
      minlength: [10, 'A tour name must have more or equal than 10 chars'],
      //   validate: [validator.isAlpha, 'A Tour name must only contains chars'],
    },
    slug: String,
    duration: {
      type: Number,
      required: [true, 'A tour must have a duration'],
    },
    maxGroupSize: {
      type: Number,
      required: [true, 'A tour must have a group size'],
    },
    difficulty: {
      type: String,
      required: [true, 'A tour must have a difficulty'],
      enum: {
        values: ['easy', 'medium', 'difficult'],
        message: 'Difficulty is either: easy, medium, difficult',
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
      set: (val) => Number(val.toFixed(1)),
    },
    ratingsQuantity: { type: Number, default: 0 },
    price: { type: Number, required: [true, 'A tour must have a price'] },
    priceDiscount: {
      type: Number,
      validate: {
        validator: function (val) {
          return val <= this.price;
        },
        message: 'Discount price ({VALUE}) should be below regular price',
      },
    },
    summary: {
      type: String,
      trim: true,
      required: [true, 'A tour must have a summary'],
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'A tour must have a description'],
    },
    imageCover: {
      type: String,
      required: [true, 'A tour must have a cover image'],
    },
    images: [String],
    createAt: {
      type: Date,
      default: Date.now(),
      select: false,
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false,
    },
    startLocation: {
      // GeoJSON
      type: {
        type: String,
        default: 'Point',
        enum: ['Point'],
      },
      coordinates: [Number],
      address: String,
      description: String,
    },
    locations: [
      {
        type: {
          type: String,
          default: 'Point',
          enum: ['Point'],
        },
        coordinates: [Number],
        address: String,
        description: String,
        day: Number,
      },
    ],
    guides: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// tourSchema.index({ price: 1 });
tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });
tourSchema.index({ startLocation: '2dsphere' });

// mot so thu khong co trong schema goc nhung muon tinh toan va hien thi them thi dung virtual cua mongoDB
tourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7;
});

// Virtual populate
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour',
  localField: '_id',
});

// MongoDB cung co Middleware nhu Express
// Type 1: pre('save')
// DOCUMENT MIDDLEWARE: runs before .save() and .create()
// this middleware has access to the document currently processed
// we use async function in mongoose >6.0
// pre is for before the completion
tourSchema.pre('save', async function () {
  this.slug = slugify(this.name, { lower: true });
});

// EMBEDDING 'guides' Users into Tour Schema
// tourSchema.pre('save', async function () {
//   const guidesPromises = this.guides.map(async (id) => await User.findById(id));
//   this.guides = await Promise.all(guidesPromises);
// });

// //post is for after the doc is completed, and we dont have this keyword BUT have the keyword doc
// // eslint-disable-next-line prefer-arrow-callback
// tourSchema.post('save', function (doc) {
//   console.log(doc);
// });

// Type 2: pre('find')
// QUERY MIDDLEWARE: run before or after a query is executed
tourSchema.pre(/^find/, async function () {
  this.find({ secretTour: { $ne: true } });
  this.start = Date.now();
});

// tourSchema.post(/^find/, function (doc) {
//   console.log(`Query took ${Date.now() - this.start} milliseconds!`);
//   console.log(doc);
// });

tourSchema.pre(/^find/, async function () {
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt',
  });
});

// Type 3: pre('aggregate')
// AGGREGATION MIDDLEWARE
// tourSchema.pre('aggregate', async function () {
//   this.pipeline().unshift({ $match: { secretTour: { $ne: true } } });
// });

// create a model to use the created schema
const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
