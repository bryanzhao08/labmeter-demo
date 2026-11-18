#!/bin/sh
# Builds hype.js (film.js scene + hype-extra.js timeline) and records parity-hype-v1.mp4 with a generated beat.
cd "$(dirname "$0")"
cat film.js hype-extra.js > hype.js
sed 's/film.js/hype.js/' film.html > hype.html
FILM_HTML=hype.html OUT=parity-hype-silent REVIEW_DIR=review-hype REVIEW='[7.6,8.9,10.3,11.6,13.9,15.6,18.4,28.0,29.8,31.2]' ../../node_modules/.bin/electron record.cjs
