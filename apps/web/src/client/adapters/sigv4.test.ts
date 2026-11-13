import { describe, expect, it } from 'vitest';
import {
  EMPTY_SHA256,
  presignQuery,
  queryString,
  sha256Hex,
  signRequest,
  uriEncode,
} from './sigv4';

/** aws-sig-v4-test-suite credentials and time. */
const suite = {
  region: 'us-east-1',
  service: 'service',
  credentials: {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  },
  date: new Date('2015-08-30T12:36:00Z'),
  host: 'example.amazonaws.com',
  payloadHash: EMPTY_SHA256,
};

/** Examples from the S3 "Signature Calculations for the Authorization Header" guide. */
const s3 = {
  region: 'us-east-1',
  service: 's3',
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
  date: new Date('2013-05-24T00:00:00Z'),
  host: 'examplebucket.s3.amazonaws.com',
  singleEncodePath: true,
};

const sig = (h: Record<string, string>) => /Signature=([0-9a-f]{64})$/.exec(h.authorization!)![1];

describe('SigV4', () => {
  it('get-vanilla', async () => {
    const h = await signRequest({ ...suite, method: 'GET', path: '/' });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(h['x-amz-date']).toBe('20150830T123600Z');
    expect(h).not.toHaveProperty('host');
  });

  it('get-vanilla-query-order-key-case', async () => {
    const h = await signRequest({
      ...suite,
      method: 'GET',
      path: '/',
      query: [
        ['Param2', 'value2'],
        ['Param1', 'value1'],
      ],
    });
    expect(sig(h)).toBe('b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
  });

  it('post-vanilla', async () => {
    const h = await signRequest({ ...suite, method: 'POST', path: '/' });
    expect(sig(h)).toBe('5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b');
  });

  it('S3 GET object with a range', async () => {
    const h = await signRequest({
      ...s3,
      method: 'GET',
      path: '/test.txt',
      headers: { range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY_SHA256 },
      payloadHash: EMPTY_SHA256,
    });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('S3 PUT object', async () => {
    const payloadHash = await sha256Hex('Welcome to Amazon S3.');
    expect(payloadHash).toBe('44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    const h = await signRequest({
      ...s3,
      method: 'PUT',
      path: '/test$file.text',
      headers: {
        date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
        'x-amz-content-sha256': payloadHash,
      },
      payloadHash,
    });
    expect(h.authorization).toContain(
      'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });

  it('S3 presigned GET', async () => {
    const q = await presignQuery({ ...s3, method: 'GET', path: '/test.txt', expiresSec: 86_400 });
    expect(queryString(q)).toBe(
      'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('encodes like SigV4 (UTF-8, uppercase hex, unreserved kept)', () => {
    expect(uriEncode('a b/ü~*')).toBe('a%20b%2F%C3%BC~%2A');
    expect(uriEncode('/askcalls/x y', false)).toBe('/askcalls/x%20y');
  });
});
