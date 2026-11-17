// SPDX-License-Identifier: GPL-3.0-only
export function jazzConfigFromAddonOptions(options) {
  return { enabled: options.jazz_enabled === true, network: 'ethereum', recipient: options.jazz_recipient || '',
    apiKey: options.jazz_openai_api_key || '', dailyLimit: options.jazz_daily_limit ?? 30,
    rpcUrl: 'https://ethereum-rpc.publicnode.com' };
}
