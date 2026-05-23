
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch all active sources
    const { data: sources, error: sourcesError } = await supabase
      .from('music_sources')
      .select('*')
      .eq('active', true)

    if (sourcesError) throw sourcesError

    let totalFetched = 0
    let totalInserted = 0
    const errors: string[] = []

    // Process each source
    for (const source of sources ?? []) {
      try {
        if (source.type === 'playlist') {
          const videos = await fetchPlaylistVideos(source.source_id)
          const inserted = await storeVideos(videos, source.category, source.source_id, supabase)
          totalFetched += videos.length
          totalInserted += inserted
        } else if (source.type === 'channel') {
          const uploadsPlaylistId = await getChannelUploadsPlaylist(source.source_id)
          const videos = await fetchPlaylistVideos(uploadsPlaylistId)
          const inserted = await storeVideos(videos, source.category, uploadsPlaylistId, supabase)
          totalFetched += videos.length
          totalInserted += inserted
        }

        // Update last_refreshed timestamp
        await supabase
          .from('music_sources')
          .update({ last_refreshed: new Date().toISOString() })
          .eq('id', source.id)

      } catch (sourceError) {
        const errMsg = sourceError instanceof Error ? sourceError.message : String(sourceError)
        errors.push(`Source ${source.source_id}: ${errMsg}`)
        console.error(`Error processing source ${source.source_id}:`, sourceError)
        // Continue processing other sources instead of failing completely
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        totalFetched,
        totalInserted,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length === 0 
          ? `Refreshed catalog: ${totalFetched} videos fetched, ${totalInserted} new videos added`
          : `Partial refresh: ${totalFetched} videos fetched, ${totalInserted} added. Errors: ${errors.length}`
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Safe YouTube API JSON fetcher
async function fetchYouTubeJson(url: string): Promise<any> {
  const response = await fetch(url)
  const raw = await response.text()

  if (!response.ok) {
    throw new Error(`YouTube API error ${response.status}: ${raw.slice(0, 300)}`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Expected JSON but received: ${raw.slice(0, 120)}`)
  }
}

// Fetch playlist videos (ONLY FIRST PAGE - quota optimization)
async function fetchPlaylistVideos(playlistId: string): Promise<any[]> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: '60', // Only fetch latest 60 videos per source
    key: YOUTUBE_API_KEY,
  })

  const data = await fetchYouTubeJson(
    `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
  )

  return data.items || []
}

// Get channel's uploads playlist ID
async function getChannelUploadsPlaylist(channelId: string): Promise<string> {
  const data = await fetchYouTubeJson(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`
  )

  if (!data.items?.[0]) {
    throw new Error(`Channel ${channelId} not found`)
  }

  return data.items[0].contentDetails.relatedPlaylists.uploads
}

// Fetch video details in batches
async function fetchVideoDetails(videoIds: string[]): Promise<any[]> {
  if (!videoIds.length) return []

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,status,statistics',
    id: videoIds.join(','),
    key: YOUTUBE_API_KEY,
  })

  const data = await fetchYouTubeJson(
    `https://www.googleapis.com/youtube/v3/videos?${params}`
  )

  return data.items || []
}

// Parse ISO 8601 duration
function parseDuration(isoDuration: string | undefined | null): number {
  if (!isoDuration) return 0
  
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0

  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')

  return hours * 3600 + minutes * 60 + seconds
}

// Extract artist from title
function extractArtist(title: string): string | null {
  const match = title.match(/^([^-|:]+)(?:\s*[-|:]\s*)/)
  return match ? match[1].trim() : null
}

// Store videos in catalog
async function storeVideos(
  playlistItems: any[],
  category: string,
  sourcePlaylistId: string,
  supabase: any
): Promise<number> {
  // Extract video IDs safely
  const videoIds = playlistItems
    .map(item => item?.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id))

  if (!videoIds.length) return 0

  // Fetch detailed video info
  const videoDetails = await fetchVideoDetails(videoIds)

  // Normalize to catalog format
  const catalogRecords = videoDetails
    .filter(video => video?.status?.embeddable === true)
    .map(video => ({
      video_id: video.id,
      title: video.snippet.title,
      artist: extractArtist(video.snippet.title),
      thumbnail: video.snippet.thumbnails.maxresdefault?.url ||
                 video.snippet.thumbnails.high?.url ||
                 video.snippet.thumbnails.medium?.url,
      duration: parseDuration(video.contentDetails.duration),
      category,
      embeddable: true,
      view_count: parseInt(video.statistics.viewCount || '0'),
      published_at: video.snippet.publishedAt,
      source_playlist_id: sourcePlaylistId,
      last_refreshed: new Date().toISOString(),
    }))

  if (!catalogRecords.length) return 0

  // Upsert into music_catalog
  const { error } = await supabase
    .from('music_catalog')
    .upsert(catalogRecords, {
      onConflict: 'video_id',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('Error storing videos:', error)
    return 0
  }

  return catalogRecords.length
}

