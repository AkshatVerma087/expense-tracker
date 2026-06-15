import { commitBatch } from './src/modules/importer/importer.service.js';

async function run() {
  try {
    const res = await commitBatch('e091697f-f032-43bc-b35a-4cc19cc58f3d', '94882a04-5cb0-41d4-8eb9-92ac82688d28', 'f3c9cf52-c543-4e71-8677-354825040373');
    console.log(res);
  } catch (err) {
    console.error(err);
  }
}

run();
