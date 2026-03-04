import { readFile } from 'node:fs/promises';

import Ajv from 'ajv';

import { SCHEMA_PATH } from './config';

export async function validateWithSchema(args: {
  schemaPath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<{ valid: boolean; errors: any[] }> {
  const schemaText = await readFile(args.schemaPath, 'utf8');
  const schema = JSON.parse(schemaText);

  // Use standard AJV with 2020 draft support via options
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = Boolean(validate(args.data));

  return { valid, errors: validate.errors ?? [] };
}

export async function validateCpm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cpm: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ valid: boolean; errors: any[] }> {
  return validateWithSchema({ schemaPath: SCHEMA_PATH, data: cpm });
}
