import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[0-9a-f-]{36}\.(tif|png)$/.test(filename))
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), 'storage', 'uploads', filename));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/tiff',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }
}
