// Original generated six-second H.264 sample, compressed to keep the fixture source small.
// Used only with explicit local DEMO_MODE; never shipped to production venues.
import {gunzipSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const encoded='H4sIAAAAAAAC/2NgYFBIK6ksyCzOz2VgYGIA0UBslFiWbJhbYGLIwMBsl5ufX8bAwJCTW5aRwoACmF8wMIgXMDAygBACMKKqQuc7MOAFTECUWVKUmA1kx5Rkg+1kxjQNaC8Dfnuw2rsAiKPAXJXUlJJiIC2TmlNcgtABNResl/FhbkpmIpChkJuC7negaYwNDKFHwBzdjJScIphMWWZKKrLKMCA/3yMxLyUnFaSGsSc3My8NyBApywUbiuxMlRSInExKUWoakjd4SotyFCBsRp/ikqQcIHtPcUlxCpKaNaBIwxEUII9HMXgAaQ+YClEfoHozQz1DSz1DA0OFnMykCiMzEyQdEv//A0lQUnBmdDrA8/8hg2Q6kF4myGX+5IALKFJYQASHTcAKN0YGtowTTmzeIDcKFCQWF0DdAMIiSSVF0ABm8oOZXVwCDnyYW9mg0SMC9BOyOAjLAMWS0cTYoLQOUK4Kyc1AccYWIM2NBQPNTs5HmMOcB6QTS1NKQBEcmZsKpkFAETkygQmgKLGgIAc5KHUyISlGZWVJfj44shLBmsGBDgzVNGComgMD1RjI5UgrSgWmBsbDuUBFoCST2tHE9E+plYHR+ccDhuMMjMw39X6/3wdEu16vg6D9/3sz+Zo4hOuya1g97vH6z7B/3GT2w6dI3cng9x17yZVivxpuFfd2vq16nL7PLUGQ4e98I/s/Z6Yd5zt4Sep27rcbmvsKjjCd/VD1Z4LOg67ENUvEUyzuMQhfz/q/gP1kXVJ0NXPZwp8Rt/weFE6aOTm5ba7uue86Il7al2dbJLc6yM/N9dj+76HJw0vM+y4wxl++wlbWbqf+THnh+tu//1zgamGc/keeZe/cMjZb3cD5XUs2Ljt4krf66/9jjDd0G6vXKXBsa7f6/+DqrCX8jSGXfYOvTj2zifHVB6aGO/2PC341RQG99///jwxLBsHZMU8ev/IoSOo9sCPAd5tTdvzUtszi92ofElf/f6HjUFBgUfhOc4pf/7VNrD0PHv+8ziWcvT7+iXt4rvx/R43nrDxnS18Venmd/7lvTt+hhn+mu9v//P9/MF4jtsv7Qep5baWZye4X76/8vrmqSQoWqDB0ABgn7I6zZFj/yEGZWoz17BsgTGsE05Mh+uAbCDPSIfzgGwDtuc/gKQUAAA==';
const film=gunzipSync(Buffer.from(encoded,'base64'));
if(createHash('sha256').update(film).digest('hex')!=='7837138330da8c5adb5ee0ed3963d616f1f3ddd0a46c29afce01af4dbf179087')throw Error('Sample fixture integrity check failed.');
writeFileSync(new URL('sample.mp4',import.meta.url),film);
