import {formatMediaPresentation} from '../../extension/ui/mediaView.js';

function expect(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

// 1. No player / empty media
{
    const pres = formatMediaPresentation(null);
    expect(pres.hasPlayer, false, 'No player for null media');
    expect(pres.title, 'No Media Playing', 'Fallback title');
    expect(pres.artist, '', 'Empty artist');
    expect(pres.canPlayPause, false, 'PlayPause disabled');
    expect(pres.canNext, false, 'Next disabled');
    expect(pres.canPrevious, false, 'Previous disabled');
    expect(pres.progress, 0.0, 'Zero progress');
}

// 2. Active playing media
{
    const media = {
        playerId: 'org.mpris.MediaPlayer2.spotify',
        title: 'Song Name',
        artist: 'Band Name',
        playbackStatus: 'Playing',
        canPlay: true,
        canPause: true,
        canNext: true,
        canPrevious: false,
        positionUs: 50000000,
        durationUs: 100000000,
    };
    const pres = formatMediaPresentation(media);
    expect(pres.hasPlayer, true, 'Active player detected');
    expect(pres.title, 'Song Name', 'Title mapped');
    expect(pres.artist, 'Band Name', 'Artist mapped');
    expect(pres.isPlaying, true, 'Is playing status');
    expect(pres.canPlayPause, true, 'Can play/pause');
    expect(pres.canNext, true, 'Can next');
    expect(pres.canPrevious, false, 'Cannot previous');
    expect(pres.progress, 0.5, '50% progress calculated');
}

// 3. Paused media with fallback title
{
    const media = {
        playerId: 'org.mpris.MediaPlayer2.vlc',
        title: '',
        artist: '',
        playbackStatus: 'Paused',
        canPlay: true,
        canPause: false,
        durationUs: 0,
    };
    const pres = formatMediaPresentation(media);
    expect(pres.hasPlayer, true, 'Has player');
    expect(pres.title, 'Unknown Title', 'Fallback unknown title');
    expect(pres.artist, 'Unknown Artist', 'Fallback unknown artist');
    expect(pres.isPlaying, false, 'Not playing');
    expect(pres.canPlayPause, true, 'Can play');
    expect(pres.progress, 0.0, 'Zero duration yields 0 progress');
}

// 4. Read-only player with all controls disabled
{
    const media = {
        playerId: 'org.mpris.MediaPlayer2.web',
        title: 'Live Stream',
        artist: 'Radio Station',
        playbackStatus: 'Playing',
        canPlay: false,
        canPause: false,
        canNext: false,
        canPrevious: false,
        durationUs: 0,
    };
    const pres = formatMediaPresentation(media);
    expect(pres.canPlayPause, false, 'Read-only playpause disabled');
    expect(pres.canNext, false, 'Read-only next disabled');
    expect(pres.canPrevious, false, 'Read-only previous disabled');
}

console.log('PASS: 18 media presentation mapper tests');
