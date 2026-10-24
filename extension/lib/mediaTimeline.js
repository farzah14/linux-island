export function estimateTimeline(media, nowUs) {
    const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    if (!media?.playerId) return {positionUs: 0, durationUs: 0, progress: 0};
    const durationUs = nonnegative(media.durationUs);
    let positionUs = nonnegative(media.positionUs);
    const sample = nonnegative(media.positionSampleUs);
    const rate = Number(media.rate) > 0 && Number.isFinite(Number(media.rate)) ? Number(media.rate) : 1;
    if (media.playbackStatus === 'Playing' && sample > 0 && nowUs >= sample)
        positionUs += (nowUs - sample) * rate;
    positionUs = Math.min(Number.MAX_SAFE_INTEGER, positionUs);
    if (durationUs > 0) positionUs = Math.min(durationUs, positionUs);
    return {positionUs, durationUs, progress: durationUs > 0 ? positionUs / durationUs : 0};
}
export function formatTime(positionUs) {
    let seconds = Math.floor(Number.isFinite(positionUs) ? Math.max(0, positionUs) / 1000000 : 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    seconds %= 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
