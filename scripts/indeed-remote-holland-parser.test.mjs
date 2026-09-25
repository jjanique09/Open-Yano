import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIndeedJobListings } from '../lib/indeed-remote-holland.mjs';

const html = fs.readFileSync('test/fixtures/indeed-nl-sample.html', 'utf8');
const jobs = parseIndeedJobListings({ html });

assert.equal(jobs.length, 2, 'expected two parsed jobs');
assert.ok(jobs.some((j) => j.title.includes('Remote Software Engineer')));
assert.ok(jobs.every((j) => j.url.includes('nl.indeed.com/viewjob')));

console.log('indeed-remote-holland parser: ok');
