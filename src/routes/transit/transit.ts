// Run with: bun run .\src\routes\transit\transit.ts
import fs from 'fs';

// 1. CONSTANTS & HEADERS
// We must mimic a real Chrome browser on Windows perfectly to avoid the "Sorry" page.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  "Sec-Ch-Ua-Arch": '"x86"',
  "Sec-Ch-Ua-Bitness": '"64"',
  "Sec-Ch-Ua-Full-Version-List": '"Not A(Brand";v="99.0.0.0", "Google Chrome";v="121.0.6167.85", "Chromium";v="121.0.6167.85"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Model": '""',
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Ch-Ua-Platform-Version": '"15.0.0"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1"
};

const CONFIG = {
  originQ: "bos",
  destQ: "nyc",
  travelDate: "2026-02-06",
  originId: "/m/01cx_",
  destId: "/m/02_286",
  originLatLng: "423555076,-710565364",
  destLatLng: "407127753,-740059728",
};

interface SessionData {
  cookies: string;
  fc: string;
  ei: string;
}

// Helper to parse 'set-cookie' headers and merge them
function mergeCookies(existingCookies: string, newSetCookieHeader: string | null): string {
  if (!newSetCookieHeader) return existingCookies;
  
  const cookieMap = new Map<string, string>();
  
  // Load existing
  existingCookies.split(';').forEach(c => {
    const [key, val] = c.split('=').map(s => s.trim());
    if (key) cookieMap.set(key, val || '');
  });

  // Load new (Bun/Node can return array or single string, normalizing here)
  // Note: Handling multiple Set-Cookie headers in basic fetch is tricky, 
  // but usually we just need the first chunk or comma-separated chunk.
  const newCookies = Array.isArray(newSetCookieHeader) ? newSetCookieHeader : [newSetCookieHeader];
  
  newCookies.forEach(cookieStr => {
    // Split by comma if multiple cookies are combined (common in some fetch polyfills)
    // but standard Set-Cookie structure uses semi-colons for attributes. 
    // This simple parser assumes standard "Key=Value; attributes" format.
    const parts = cookieStr.split(';');
    const [key, val] = parts[0].split('=');
    if (key) cookieMap.set(key.trim(), val ? val.trim() : '');
  });

  return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function getSessionData(): Promise<SessionData> {
  // --- STEP A: Prime the session (Hit Homepage) ---
  console.log("1. Priming session (Fetching google.com)...");
  
  const homeResp = await fetch("https://www.google.com/", {
    headers: BASE_HEADERS
  });
  
  let currentCookies = mergeCookies("", homeResp.headers.get("set-cookie"));
  console.log(`   [+] Initial Cookies: ${currentCookies.substring(0, 30)}...`);

  // --- STEP B: Perform the Search ---
  console.log("2. Performing Search Handshake...");
  
  const searchUrl = `https://www.google.com/search?q=${CONFIG.originQ}+to+${CONFIG.destQ}+trains&hl=en&gl=us`;
  
  // Important: Update Referer and Site for this request
  const searchHeaders = {
    ...BASE_HEADERS,
    "Sec-Fetch-Site": "same-origin",
    "Referer": "https://www.google.com/",
    "Cookie": currentCookies
  };

  const response = await fetch(searchUrl, { headers: searchHeaders });
  
  // Merge new cookies (like NID) into our session
  currentCookies = mergeCookies(currentCookies, response.headers.get("set-cookie"));
  
  const html = await response.text();

  // --- DEBUGGING ---
  if (html.includes("/httpservice/retry/enablejs")) {
    await fs.promises.writeFile("debug_fail.html", html);
    throw new Error("Google blocked the request (JsCheck). See debug_fail.html.");
  }

  // 1. EXTRACT 'fc' (Form Context)
  let fc = null;
  const fcMatch = html.match(/data-async-fc="([^"]+)"/);
  if (fcMatch) {
    fc = fcMatch[1];
  } else {
    // Deep fallback search
    const fcScriptMatch = html.match(/"fc":"([^"]+)"/);
    if (fcScriptMatch) fc = fcScriptMatch[1];
  }

  // 2. EXTRACT 'ei'
  const eiMatch = html.match(/ei\s*=\s*['"]([^'"]+)['"]/) || html.match(/google\.kEI\s*=\s*['"]([^'"]+)['"]/);
  const ei = eiMatch ? eiMatch[1] : "";

  if (!fc) {
    await fs.promises.writeFile("debug_google.html", html);
    throw new Error("Failed to extract 'fc' token. Google might have served a Captcha or different layout. Saved to debug_google.html");
  }

  console.log(`   [+] FC Token: ${fc.substring(0, 20)}...`);
  
  return { cookies: currentCookies, fc, ei };
}

async function fetchTrainData(session: SessionData) {
  console.log(`3. Hitting Async API for date: ${CONFIG.travelDate}...`);

  // The async block definition
  const asyncParam = `_basejs:/xjs/_/js/k=xjs.s.en.gAfIkZ8UUP4.2019.O/am=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQIAAAFCAAAAIAAAAAAAAAAAAgAAEgAcAAAAAAAAAAAAAAAAAAAAAACAgAAABADQAAAAAAAAAAAAAIAAABAAAAAAAAAAADAAEAIAAAgoAAACgAAAAAAAAAAAAAAAAAAAAEoIAAICQQAIA_rc_pAEAAAAAAIAAAAAAAAAAAAAAAAAgAQAAAAAAAACwAAAACIUBAAggBAgAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAABAAAAoAAAAAQAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAABABAAAAAAHAAAAAAAAgAAAAAAAAAAAAAAAAAACAAAAAhgAEAAAAAABQACOAHAIAAAAAAAAA4AAAAhAAAAAAAXEARAQBAAAAAAADkAPB4AIcIDgAAAAAAAAAAAAAAAAAAAAAAAqAAjAPJDwhAAAAAAAAAAAAAAAAAAAAAAAAAAABUhE2sGgAI/dg=0/br=1/ichc=1/rs=ACT90oE7IWgVEsXS44lPsqC2Lxz1kB-acw/cb=loaded_h_0,_basecss:/xjs/_/ss/k=xjs.s.Ry1gq2MFQw4.L.B1.O/am=AIAAAIAgAAAAAAAAAAAAIAAAIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAABAAAAJAogAgAAAAAAAA4AMAgKcAACAAAAAeAAZAkAEAAAAAAAACQAAAADQAAAAAAAAAAAAAIAAAAAAAABAAAAAAAAAEAIAAQgAAAAAAUAAABAAAAAAAAAAAAAAAEKIAAIAAAAIAAAAAxAEAAAAAAAAAAAAACAAAAAACAGAAiAEAAAAAIBgAAAAAAAAAAAgABAAAAAAIAEAEBQgAJGAAAAAAMAAAAAAAAIACYAQBBAEIoBACAAA4AAAAAAAAAAAAQAAAAAAAAIAAAAQEIAQQAAAABAAAIAAAAHIAAAAACAAAAhAIMHgDAAMAAEAgACAEAIADAAGIAAAAABQEQAAAAAAAAAAAAAAYAQAAAAAAAAsA3EcRAQAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAABA/br=1/cb=loaded_h_0/rs=ACT90oGd801SMVyqM7fmyDj0XBs_POFxag,_basecomb:/xjs/_/js/k=xjs.s.en.gAfIkZ8UUP4.2019.O/ck=xjs.s.Ry1gq2MFQw4.L.B1.O/am=AIAAAIAgAAAAAAAAAAAAIAAAIQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAQAAAQIAAAFCAAAJIogAgAAAAAAAA4AMEgKcAACAAAAAeAAZAkAEAAAAAACAiQAABADQAAAAAAAAAAAAAIAAABAAAABAAAAAADAAEAIAAQgoAAACgUAAABAAAAAAAAAAAAAAAEqIAAICQQAIA_rc_5AEAAAAAAIAAAAAACAAAAAACAGAgiQEAAAAAIBiwAAAACIUBAAggBAgAAAAIAEAEBQgAJGAACAAAMAAAAAAAAIACYAQBBAEIoBACAAQ4AAAAAAAAAAAAQAAAAAAAgIAAAAQEIAQQAAAABABAIAAAAHIAAAAACAgAAhAIMHgDAAMAAEAgACAEAIAjgAGIAAAAABQESOAHAIAAAAAAAAA4AQAAhAAAAAsA3EcRAQBAAAAAAADkAPB4AIcIDgAAAAAAAAAAAAAAAAAAAAAAAqAAjAPJLwhAAAAAAAAAAAAAAAAAAAAAAAAAAABUhE2sGgAI/d=1/ed=1/dg=0/br=1/ujg=1/ichc=1/rs=ACT90oFCH117foZrkY-p3GUFopw_0_ctIw/cb=loaded_h_0,_fmt:prog,_id:fc_HGWCac2vJoqtiLMP8dmTuAQ_1`;

  const baseUrl = "https://www.google.com/async/callback:3804";
  
  const params = new URLSearchParams({
    "fc": session.fc,
    "fcv": "3",
    "ei": session.ei,
    "yv": "3",
    "tr_d": CONFIG.travelDate,
    "tr_t": "0",
    "tr_or": CONFIG.originId,
    "tr_dest": CONFIG.destId,
    "tr_or_latlng": CONFIG.originLatLng,
    "tr_dest_latlng": CONFIG.destLatLng,
    "cs": "1",
    "async": asyncParam
  });

  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    headers: {
      ...BASE_HEADERS,
      "Sec-Fetch-Dest": "empty", // Async requests are empty dest, not document
      "Sec-Fetch-Site": "same-origin",
      "Cookie": session.cookies,
      "X-Browser-Channel": "stable",
      "X-Browser-Year": "2026",
      "X-Dos-Behavior": "Embed",
      "Referer": "https://www.google.com/"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Status:", response.status);
    throw new Error("API Request Failed: " + text.substring(0, 100));
  }

  const rawText = await response.text();
  const cleanJson = rawText.replace(/^\)]}'\s*/, "");
  
  try {
    const data = JSON.parse(cleanJson);
    console.log("   [+] Data received successfully.");
    await fs.promises.writeFile("train_response.json", cleanJson);
    console.log("[!] Full response saved to 'train_response.json'");
  } catch (e) {
    console.log("Error parsing JSON. Check 'train_response.json'.");
  }
}

try {
  const session = await getSessionData();
  await fetchTrainData(session);
} catch (error: any) {
  console.error("\nFATAL ERROR:", error.message);
}