#!/bin/sh
# Builds hype.js (film.js scene + hype-extra.js timeline) and records parity-hype-v1.mp4 with a generated beat.
cd "$(dirname "$0")"
cat film.js hype-extra.js > hype.js
sed 's/film.js/hype.js/' film.html > hype.html
FILM_HTML=hype.html OUT=parity-hype-silent REVIEW_DIR=review-hype REVIEW='[0.3,1.5,3.2,4.4,5.4,7.5,12,15.2,18.5,22.5]' ../../node_modules/.bin/electron record.cjs
