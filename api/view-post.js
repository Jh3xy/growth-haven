
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Grab the post ID from the URL (?id=...)
  const { id } = req.query;

  //  Set up your default safeguards based on your current HTML
  let title = "Like Post on GrowthHaven";
  let description = "Earn from GrowthHaven today — reward for your activity.";
  let image = "https://growthhaven.app/assets/other/og-default.png";

  //  Connect to Supabase ONLY if an ID exists in the URL
  if (id) {
    // We use the Service Role Key here to bypass RLS safely on the server side
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: post, error } = await supabase
      .from('posts')
      .select('title, content, image_url')
      .eq('id', id)
      .single();

    //  If the post exists, apply your dynamic data & safeguards
    if (post) {
      if (post.title) {
        title = `${post.title} — GrowthHaven`;
      }
      
      if (post.image_url) {
        image = post.image_url;
      }

      if (post.content) {
        // Remove excess whitespace and truncate long text for the preview snippet
        const cleanContent = post.content.trim();
        description = cleanContent.length > 200 
          ? cleanContent.substring(0, 200) + "..." 
          : cleanContent;
      }
    }
  }

  try {
    // Read the finalized HTML file that Vite built
    // Vite outputs to 'dist' by default. We target your view-post page.
    const filePath = path.join(process.cwd(), 'dist', 'src', 'view-post', 'index.html');
    let html = fs.readFileSync(filePath, 'utf8');

    // 6. Inject the dynamic tags by replacing the static ones using regex
    html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}" />`);
    html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${description}" />`);
    html = html.replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${image}" />`);
    
    html = html.replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${title}" />`);
    html = html.replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${description}" />`);
    html = html.replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${image}" />`);

    // Send the customized HTML back to the browser or social media bot
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (err) {
    console.error("Error reading built HTML:", err);
    // Ultimate fallback if file reading fails
    res.status(500).send("Server Error: Could not load the post preview.");
  }
}
