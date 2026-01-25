import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'ok',
    message: 'Minimal handler working',
    timestamp: new Date().toISOString()
  });
}
