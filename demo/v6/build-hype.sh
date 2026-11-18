#!/bin/sh
# Builds hype.js (film.js scene + hype-extra.js timeline) and records parity-hype-v1.mp4 with a generated beat.
cd "$(dirname "$0")"
cat film.js hype-extra.js > hype.js
sed 's/film.js/hype.js/' film.html > hype.html
FILM_HTML=hype.html OUT=parity-hype-silent REVIEW_DIR=review-hype REVIEW='[1,2.8,5.5,7.4,8.8,10.4,12.6,14.6,17.3,20.2,23.6,26.8,29.8]' ../../node_modules/.bin/electron record.cjs
