import COS from "cos-nodejs-sdk-v5";

export type CosGateway = {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
};

export function createCosGateway(options: {
  secretId?: string;
  secretKey?: string;
  region?: string;
  bucket?: string;
}): CosGateway {
  if (!options.secretId || !options.secretKey || !options.region || !options.bucket) {
    return {
      async putObject() { throw new Error("COS is not configured"); },
      async deleteObject() { throw new Error("COS is not configured"); }
    };
  }
  const client = new COS({ SecretId: options.secretId, SecretKey: options.secretKey });
  return {
    putObject: (input) => new Promise((resolve, reject) => {
      client.putObject({ Bucket: options.bucket!, Region: options.region!, Key: input.key, Body: input.body, ContentType: input.contentType }, (error) => error ? reject(error) : resolve());
    }),
    deleteObject: (key) => new Promise((resolve, reject) => {
      client.deleteObject({ Bucket: options.bucket!, Region: options.region!, Key: key }, (error) => error ? reject(error) : resolve());
    })
  };
}
