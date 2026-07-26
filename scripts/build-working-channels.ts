import { generateAndRegisterChannels } from './generate-channels';

async function main() {
  await generateAndRegisterChannels();
}

main().catch(console.error);
