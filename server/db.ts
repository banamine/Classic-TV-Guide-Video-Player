import fs from 'fs';
import path from 'path';
import { Channel } from '../src/types';

const DB_PATH = path.join(process.cwd(), 'data', 'database.json');

export class LocalDatabase {
  private static readDb() {
    if (!fs.existsSync(DB_PATH)) {
      return {
        channels: [],
        scraperStatus: { isRunning: false, progress: 0, lastRun: null, currentTask: '' },
        scraperSettings: { intervalHours: 24, autoEnrich: true },
        scraperLogs: [],
        complianceLogs: [],
        telemetryLogs: []
      };
    }
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      return {
        channels: [],
        scraperStatus: { isRunning: false, progress: 0, lastRun: null, currentTask: '' },
        scraperSettings: { intervalHours: 24, autoEnrich: true },
        scraperLogs: [],
        complianceLogs: [],
        telemetryLogs: []
      };
    }
  }

  private static writeDb(data: any) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  static getChannels(): Channel[] {
    const db = this.readDb();
    return db.channels || [];
  }

  static saveChannels(channels: Channel[]) {
    const db = this.readDb();
    db.channels = channels;
    this.writeDb(db);
    CHANNELS_DATA = channels;
  }

  static getScraperStatus() {
    const db = this.readDb();
    return db.scraperStatus || { isRunning: false, progress: 0, lastRun: null, currentTask: '' };
  }

  static updateScraperStatus(status: any) {
    const db = this.readDb();
    db.scraperStatus = { ...(db.scraperStatus || {}), ...status };
    this.writeDb(db);
  }

  static getScraperSettings() {
    const db = this.readDb();
    const defaults = {
      intervalHours: 24,
      pollingIntervalMins: 60,
      cronSchedule: '0 3 * * *',
      autoEnrich: true,
      enrichWithGemini: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
      minDelayMs: 1000,
      maxDelayMs: 3000,
      targets: [
        'https://archive.org/download/daily-highlights/BIG%20WESTERN%20ZONE.m3u',
        'https://archive.org/download/daily-highlights/TV%20CRIME_cleaned.m3u'
      ]
    };
    return { ...defaults, ...(db.scraperSettings || {}) };
  }

  static saveScraperSettings(settings: any) {
    const db = this.readDb();
    db.scraperSettings = { ...(db.scraperSettings || {}), ...settings };
    this.writeDb(db);
  }

  static addScraperLog(msg: string) {
    const db = this.readDb();
    if (!db.scraperLogs) db.scraperLogs = [];
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logEntry = `[${timestamp}] ${msg}`;
    db.scraperLogs.push(logEntry);
    if (db.scraperLogs.length > 500) {
      db.scraperLogs = db.scraperLogs.slice(-500);
    }
    this.writeDb(db);
  }

  static getScraperLogs(): string[] {
    const db = this.readDb();
    return db.scraperLogs || [];
  }

  static clearScraperLogs() {
    const db = this.readDb();
    db.scraperLogs = [];
    this.writeDb(db);
  }

  static addComplianceLog(action: string, details: string) {
    const db = this.readDb();
    if (!db.complianceLogs) db.complianceLogs = [];
    db.complianceLogs.push({
      timestamp: new Date().toISOString(),
      action,
      details
    });
    if (db.complianceLogs.length > 200) {
      db.complianceLogs = db.complianceLogs.slice(-200);
    }
    this.writeDb(db);
  }

  static getComplianceLogs(): any[] {
    const db = this.readDb();
    return db.complianceLogs || [];
  }

  static addTelemetryLog(log: any) {
    const db = this.readDb();
    if (!db.telemetryLogs) db.telemetryLogs = [];
    db.telemetryLogs.push({
      timestamp: new Date().toISOString(),
      ...log
    });
    if (db.telemetryLogs.length > 500) {
      db.telemetryLogs = db.telemetryLogs.slice(-500);
    }
    this.writeDb(db);
  }

  static getTelemetryLogs(): any[] {
    const db = this.readDb();
    return db.telemetryLogs || [];
  }

  static clearTelemetryLogs() {
    const db = this.readDb();
    db.telemetryLogs = [];
    this.writeDb(db);
  }

  static getStats() {
    const db = this.readDb();
    const channels = db.channels || [];
    let totalShows = 0;
    let totalEpisodes = 0;
    channels.forEach((ch: Channel) => {
      if (ch.shows) {
        totalShows += ch.shows.length;
        ch.shows.forEach(s => {
          if (s.episodes) totalEpisodes += s.episodes.length;
        });
      }
    });
    return {
      totalChannels: channels.length,
      totalShows,
      totalEpisodes,
      lastUpdated: db.scraperStatus?.lastRun || null
    };
  }

  static exportDatabase() {
    return this.readDb();
  }

  static importDatabase(data: any) {
    if (data && typeof data === 'object') {
      try {
        this.writeDb(data);
        if (Array.isArray(data.channels)) {
          CHANNELS_DATA = data.channels;
        }
        return { success: true, message: 'Database snapshot restored successfully.' };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }
    return { success: false, message: 'Invalid payload: snapshot must be a JSON object.' };
  }
}

export let CHANNELS_DATA: Channel[] = LocalDatabase.getChannels();
