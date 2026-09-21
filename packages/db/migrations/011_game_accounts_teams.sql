CREATE TABLE game_profiles(
 user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX game_participant_event_identity ON game_participants(id,event_id);
CREATE TABLE game_account_participants(
 user_id TEXT NOT NULL REFERENCES game_profiles(user_id),
 event_id TEXT NOT NULL REFERENCES tasting_events(id),participant_id TEXT NOT NULL UNIQUE,
 linked_at INTEGER NOT NULL,PRIMARY KEY(user_id,event_id),
 FOREIGN KEY(participant_id,event_id) REFERENCES game_participants(id,event_id)
);
CREATE TRIGGER immutable_game_account_binding BEFORE UPDATE ON game_account_participants
 BEGIN SELECT RAISE(ABORT,'Account event bindings cannot be reassigned'); END;
CREATE TABLE game_team_rules(
 event_id TEXT PRIMARY KEY REFERENCES tasting_events(id),team_size INTEGER NOT NULL CHECK(team_size BETWEEN 2 AND 10),
 scoring_version TEXT NOT NULL DEFAULT 'fixed-roster-sum-v1',locked_at INTEGER
);
CREATE TABLE game_team_memberships(
 user_id TEXT NOT NULL,event_id TEXT NOT NULL REFERENCES game_team_rules(event_id),
 venue_id TEXT NOT NULL REFERENCES venues(id),joined_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,event_id),
 FOREIGN KEY(user_id,event_id) REFERENCES game_account_participants(user_id,event_id)
);
CREATE INDEX game_team_roster ON game_team_memberships(event_id,venue_id);
CREATE TRIGGER immutable_game_team_membership BEFORE UPDATE ON game_team_memberships
 BEGIN SELECT RAISE(ABORT,'Store membership cannot be reassigned'); END;
INSERT INTO migrations VALUES(11,unixepoch()*1000);
