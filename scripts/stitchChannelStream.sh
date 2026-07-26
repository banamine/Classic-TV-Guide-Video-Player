#!/usr/bin/env bash
set -e

# Pass parameters from Node Engine or environment
MAIN_SHOW="${1:-./cache/have_gun_will_travel_s01e01.mp4}"
COMMERCIAL_1="${2:-./cache/1967_capn_crunch.mp4}"
COMMERCIAL_2="${3:-./cache/1977_purina_cat_chow.mp4}"
SLATE_SOURCE="${4:-./cache/station_id_slate.mp4}"
FALLBACK_SLATE_DURATION_SEC="${5:-14.200}"
OUTPUT_HLS_DIR="${6:-./public/streams/wstn101}"

mkdir -p "$OUTPUT_HLS_DIR"
mkdir -p ./cache

# Generate precision-trimmed dynamic fallback slate clip
ffmpeg -y -ss 00:00:00 -t "$FALLBACK_SLATE_DURATION_SEC" -i "$SLATE_SOURCE" \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -preset ultrafast -crf 21 -c:a aac -ar 44100 -ac 2 ./cache/active_slate.mp4

# Construct sanitized local manifest file
cat <<EOF > concat_list.txt
file '$MAIN_SHOW'
file '$COMMERCIAL_1'
file '$COMMERCIAL_2'
file './cache/active_slate.mp4'
EOF

# Render out to continuous zero-stutter HLS stream
ffmpeg -y -f concat -safe 0 -i concat_list.txt \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -preset ultrafast -crf 21 \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -f hls -hls_time 4 -hls_playlist_type event \
  -hls_segment_filename "$OUTPUT_HLS_DIR/segment_%03d.ts" \
  "$OUTPUT_HLS_DIR/live_channel.m3u8"
