import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withRetry } from './retry.js';
import { logger } from './logger.js';

export function evidenceKey(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `evidence/${ymd}_${randomUUID()}.png`;
}

export class StorageService {
  constructor({ bucket, region, urlMode, acl, publicBaseUrl, presignExpirySeconds }) {
    this.s3 = new S3Client({ region, maxAttempts: 1 }); // Retries handled by withRetry
    this.bucket = bucket;
    this.region = region;
    this.urlMode = urlMode;
    this.acl = acl;
    this.publicBaseUrl = publicBaseUrl?.replace(/\/+$/, '');
    this.presignExpirySeconds = presignExpirySeconds;
  }

  async uploadPng(buffer) {
    const key = evidenceKey();
    await withRetry('S3 upload', () =>
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
          ...(this.acl ? { ACL: this.acl } : {}),
        }),
      ),
    );
    logger.info(`Evidence uploaded s3://${this.bucket}/${key}`);
    return { key, url: await this.urlFor(key) };
  }

  async urlFor(key) {
    if (this.urlMode === 'presigned') {
      return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: this.presignExpirySeconds,
      });
    }
    const base = this.publicBaseUrl ?? `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    return `${base}/${key}`;
  }
}
