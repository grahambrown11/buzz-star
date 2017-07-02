'use strict';

const path = require('path');
const gulp = require('gulp');
const gutil = require('gulp-util');
const source = require('vinyl-source-stream');
const rename = require('gulp-rename');
const browserify = require('browserify');
const babelify = require("babelify");
const del = require('del');
const zip = require('gulp-zip');
const replace = require('gulp-replace');
const pkg = require('./package.json');

const OUTPUT_DIR = 'chrome-phone';
let debug = true;

gulp.task('clean', () => del(OUTPUT_DIR, {force: true}));

gulp.task('copy', ['clean'], () => {
    return gulp.src([
        'src/*.js',
        'src/*.html',
//        'src/manifest.json',
        'src/css/**',
        'src/fonts/**',
        'src/img/**'
    ], {'base': 'src'})
        .pipe(gulp.dest(OUTPUT_DIR));
});

gulp.task('manifest', ['copy'], () => {
    gutil.log('pkg.version: ' + pkg.version);
    gulp.src(['src/manifest.json'])
        .pipe(replace('$$version$$', pkg.version))
        .pipe(gulp.dest(OUTPUT_DIR));
});

gulp.task('bundle', ['manifest'], () => {
    return browserify({
        entries: ['src/lib/ChromePhone.js'],
        debug: debug
    })
    .transform(babelify.configure({
        presets: ['es2015']
    }))
    .bundle().on('error', (e) => {
        gutil.log(e);
    })
    .pipe(source('chrome-phone.js'))
    .pipe(gulp.dest(OUTPUT_DIR));
});

gulp.task('default', ['bundle'], (cb) => {
    gutil.log('complete!');
    cb();
});

gulp.task('debug-off',  (cb) => {
    gutil.log('Turn debug off');
    debug = false;
    cb();
});

gulp.task('zip', ['bundle'], () => {
    gulp.src(OUTPUT_DIR + '/**', {dot: true})
    .pipe(zip('chrome-phone.zip'))
    .pipe(gulp.dest("."));
});

gulp.task('prod', ['debug-off', 'zip'], () => {
    gutil.log('complete!');
});
