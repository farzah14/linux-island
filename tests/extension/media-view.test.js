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

// 5. Volume is passed through and clamped to [0, 1]
{
    const base = {
        playerId: 'org.mpris.MediaPlayer2.spotify',
        title: 'Song Name',
        artist: 'Band Name',
        playbackStatus: 'Playing',
        durationUs: 0,
    };

    expect(formatMediaPresentation({...base, volume: 0.75}).volume, 0.75,
        'Volume passes through unchanged');
    expect(formatMediaPresentation({...base, volume: 2}).volume, 1.0,
        'Over-unity volume clamps to 1.0');
    expect(formatMediaPresentation({...base, volume: -1}).volume, 0.0,
        'Negative volume clamps to 0.0');
    expect(formatMediaPresentation({...base}).volume, 1.0,
        'Missing volume key falls back to 1.0');
    expect(formatMediaPresentation({...base, volume: 'bad'}).volume, 1.0,
        'Non-numeric volume falls back to 1.0');
    expect(formatMediaPresentation(null).volume, 1.0,
        'No-player presentation still reports 1.0');
}

// 6. Core-reported sink volume is what the slider shows, with or without a player
{
    const base = {
        playerId: 'org.mpris.MediaPlayer2.spotify',
        title: 'Song Name',
        artist: 'Band Name',
        playbackStatus: 'Playing',
        durationUs: 0,
    };

    const muted = formatMediaPresentation({...base, volume: 0, unmutedVolume: 0.4, muted: true});
    expect(muted.volume, 0, 'Muted sink reports an empty slider');
    expect(muted.unmutedVolume, 0.4, 'Mute keeps the level for restore');
    expect(muted.muted, true, 'Muted flag passes through');

    const audible = formatMediaPresentation({...base, volume: 0.4, unmutedVolume: 0.4, muted: false});
    expect(audible.volume, 0.4, 'Audible sink level is the slider value');
    expect(audible.muted, false, 'Audible sink is not muted');

    // The laptop's own level must survive a player that reports no Volume.
    const noPlayer = formatMediaPresentation({volume: 0.3, unmutedVolume: 0.3, muted: false});
    expect(noPlayer.hasPlayer, false, 'Still the no-player presentation');
    expect(noPlayer.volume, 0.3, 'No-player slider mirrors the real sink');

    // Older cores omit both keys; the player Volume remains the fallback.
    const legacy = formatMediaPresentation({...base, volume: 0.6});
    expect(legacy.volume, 0.6, 'Legacy core falls back to the player volume');
    expect(legacy.unmutedVolume, 0.6, 'Legacy core derives the restore level');
    expect(legacy.muted, false, 'Legacy core derives the mute flag');
}

console.log('PASS: 32 media presentation mapper tests');