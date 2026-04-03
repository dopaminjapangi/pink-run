import { useEffect, useRef } from "react";
import Phaser from "phaser";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 640;
const LANE_COUNT = 3;
const LANE_WIDTH = 88;
const LANE_GAP = 20;
const TRACK_CENTER_X = CANVAS_WIDTH / 2;
const PLAYER_Y = 540;
const ITEM_START_Y = -84;
const LONG_PRESS_MS = 450;
const SWIPE_DOWN_THRESHOLD = 70;
const COLLISION_DISTANCE_Y = 42;
const STAR_EVERY_HEARTS = 5;
const PLAYER_TEXTURE_KEY = "stage-player";
const ITEM_TEXTURE_KEY = "stage-item";
const HAZARD_TEXTURE_KEY = "stage-hazard-rock";

const PLAYER_CROP = { x: 291, y: 211, width: 478, height: 592 } as const;
const PLAYER_DISPLAY_SIZE = { width: 72, height: 90 } as const;
const ITEM_CROP = { x: 296, y: 457, width: 470, height: 478 } as const;
const ITEM_DISPLAY_HEIGHT = 130;
const ITEM_DISPLAY_SIZE = {
  width: Math.round((470 / 478) * ITEM_DISPLAY_HEIGHT),
  height: ITEM_DISPLAY_HEIGHT,
} as const;
const HAZARD_DISPLAY_HEIGHT = 62;
const HAZARD_DISPLAY_SIZE = {
  width: Math.round((538 / 367) * HAZARD_DISPLAY_HEIGHT),
  height: HAZARD_DISPLAY_HEIGHT,
} as const;

export interface RuntimeSnapshot {
  lane: number;
  heartsLeft: number;
  heartsCollected: number;
  starsLit: number;
  currentCombo: number;
  maxCombo: number;
  durationMs: number;
}

export interface GameOverSnapshot extends RuntimeSnapshot {
  cleared: boolean;
}

interface StageSceneHandlers {
  onRuntime: (snapshot: RuntimeSnapshot) => void;
  onGameOver: (snapshot: GameOverSnapshot) => void;
  onLongPress: () => void;
  onSwipeDown: () => void;
}

interface StageControlState {
  active: boolean;
  paused: boolean;
}

interface FallingItem {
  id: number;
  lane: number;
  y: number;
  speed: number;
  kind: "heart" | "hazard";
  sprite: Phaser.GameObjects.Image;
}

function laneX(lane: number) {
  const offset = lane - 1;
  return TRACK_CENTER_X + offset * (LANE_WIDTH + LANE_GAP);
}

function randomLane() {
  return Math.floor(Math.random() * LANE_COUNT);
}

class HeartstarStageScene extends Phaser.Scene {
  private handlersRef: { current: StageSceneHandlers };

  private controlRef: { current: StageControlState };

  private pointerDownAt = 0;

  private pointerDownY = 0;

  private playerLane = 1;

  private heartsLeft = 3;

  private heartsCollected = 0;

  private starsLit = 0;

  private currentCombo = 0;

  private maxCombo = 0;

  private startedAt = 0;

  private lastRuntimePushAt = 0;

  private spawnAccumulator = 0;

  private itemId = 0;

  private items: FallingItem[] = [];

  private player?: Phaser.GameObjects.Image;

  private flashOverlay?: Phaser.GameObjects.Rectangle;

  constructor(
    handlersRef: { current: StageSceneHandlers },
    controlRef: { current: StageControlState },
  ) {
    super("stage-scene");
    this.handlersRef = handlersRef;
    this.controlRef = controlRef;
  }

  preload() {
    if (!this.textures.exists(PLAYER_TEXTURE_KEY)) {
      this.load.image(PLAYER_TEXTURE_KEY, "/main-char.png");
    }
    if (!this.textures.exists(ITEM_TEXTURE_KEY)) {
      this.load.image(ITEM_TEXTURE_KEY, "/item.png");
    }
    if (!this.textures.exists(HAZARD_TEXTURE_KEY)) {
      this.load.image(HAZARD_TEXTURE_KEY, "/bad-rock.png");
    }
  }

  create() {
    this.renderStage();
    this.createActors();
    this.setupInput();
    this.resetRunState();
  }

  update(_time: number, delta: number) {
    if (!this.controlRef.current.active) {
      return;
    }

    if (this.player) {
      this.player.x = Phaser.Math.Linear(
        this.player.x,
        laneX(this.playerLane),
        0.3,
      );
    }

    if (this.controlRef.current.paused) {
      return;
    }

    this.spawnAccumulator += delta;
    while (this.spawnAccumulator >= this.currentSpawnInterval()) {
      this.spawnAccumulator -= this.currentSpawnInterval();
      this.spawnItem();
    }

    this.updateItems(delta);
    this.pushRuntimeSnapshotIfNeeded();
  }

  private renderStage() {
    const g = this.add.graphics();
    g.fillStyle(0x0b163f, 1);
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    g.fillStyle(0x132a63, 1);
    g.fillRect(40, 40, CANVAS_WIDTH - 80, CANVAS_HEIGHT - 80);

    const laneColors = [0x2d4f95, 0x365ca9, 0x2d4f95] as const;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      g.fillStyle(laneColors[lane], 1);
      g.fillRect(
        laneX(lane) - LANE_WIDTH / 2,
        56,
        LANE_WIDTH,
        CANVAS_HEIGHT - 112,
      );
    }

    g.lineStyle(2, 0x5e82c5, 0.8);
    g.beginPath();
    g.moveTo(TRACK_CENTER_X - (LANE_WIDTH + LANE_GAP) / 2, 56);
    g.lineTo(TRACK_CENTER_X - (LANE_WIDTH + LANE_GAP) / 2, CANVAS_HEIGHT - 56);
    g.moveTo(TRACK_CENTER_X + (LANE_WIDTH + LANE_GAP) / 2, 56);
    g.lineTo(TRACK_CENTER_X + (LANE_WIDTH + LANE_GAP) / 2, CANVAS_HEIGHT - 56);
    g.strokePath();
  }

  private createActors() {
    this.player = this.add
      .image(laneX(this.playerLane), PLAYER_Y, PLAYER_TEXTURE_KEY)
      .setCrop(
        PLAYER_CROP.x,
        PLAYER_CROP.y,
        PLAYER_CROP.width,
        PLAYER_CROP.height,
      )
      .setDisplaySize(PLAYER_DISPLAY_SIZE.width, PLAYER_DISPLAY_SIZE.height)
      .setOrigin(0.5, 0.5);

    this.flashOverlay = this.add.rectangle(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      0,
      0,
    );
  }

  private setupInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.pointerDownAt = this.time.now;
      this.pointerDownY = pointer.downY;
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.controlRef.current.active) {
        return;
      }

      const pressMs = this.time.now - this.pointerDownAt;
      const deltaY = pointer.upY - this.pointerDownY;

      if (deltaY >= SWIPE_DOWN_THRESHOLD) {
        this.handlersRef.current.onSwipeDown();
        return;
      }

      if (pressMs >= LONG_PRESS_MS) {
        this.handlersRef.current.onLongPress();
        return;
      }

      this.selectLane(this.pickLane(pointer.upX));
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on("keydown-LEFT", () => this.selectLane(0));
      keyboard.on("keydown-DOWN", () => this.selectLane(1));
      keyboard.on("keydown-RIGHT", () => this.selectLane(2));
      keyboard.on("keydown-ESC", () => this.handlersRef.current.onLongPress());
    }
  }

  private resetRunState() {
    for (const item of this.items) {
      item.sprite.destroy();
    }
    this.items = [];
    this.spawnAccumulator = 0;
    this.itemId = 0;
    this.playerLane = 1;
    this.heartsLeft = 3;
    this.heartsCollected = 0;
    this.starsLit = 0;
    this.currentCombo = 0;
    this.maxCombo = 0;
    this.startedAt = this.time.now;
    this.lastRuntimePushAt = 0;
    this.flash(0x000000, 0);
    this.pushRuntimeSnapshot(true);
  }

  private selectLane(lane: number) {
    if (this.controlRef.current.paused) {
      return;
    }
    this.playerLane = Phaser.Math.Clamp(lane, 0, LANE_COUNT - 1);
    this.pushRuntimeSnapshotIfNeeded(true);
  }

  private pickLane(pointerX: number) {
    const leftEdge =
      TRACK_CENTER_X -
      (LANE_WIDTH * LANE_COUNT + LANE_GAP * (LANE_COUNT - 1)) / 2;
    const segment = LANE_WIDTH + LANE_GAP;
    const lane = Math.floor((pointerX - leftEdge) / segment);
    return Phaser.Math.Clamp(lane, 0, LANE_COUNT - 1);
  }

  private currentSpawnInterval() {
    const elapsed = this.time.now - this.startedAt;
    const base = 820 - Math.floor(elapsed / 7000) * 40;
    return Math.max(330, base);
  }

  private currentItemSpeed() {
    const elapsed = this.time.now - this.startedAt;
    const base = 175 + Math.floor(elapsed / 5000) * 8;
    return Math.min(340, base);
  }

  private createFallingSprite(lane: number, kind: "heart" | "hazard") {
    const textureKey = kind === "heart" ? ITEM_TEXTURE_KEY : HAZARD_TEXTURE_KEY;
    const crop = kind === "heart" ? ITEM_CROP : null;
    const displaySize =
      kind === "heart" ? ITEM_DISPLAY_SIZE : HAZARD_DISPLAY_SIZE;

    const sprite = this.add.image(laneX(lane), ITEM_START_Y, textureKey);
    if (crop) {
      sprite.setCrop(crop.x, crop.y, crop.width, crop.height);
    }
    return sprite
      .setDisplaySize(displaySize.width, displaySize.height)
      .setOrigin(0.5, 0.5);
  }

  private spawnItem() {
    const lane = randomLane();
    const kind: "heart" | "hazard" = Math.random() < 0.7 ? "heart" : "hazard";
    const sprite = this.createFallingSprite(lane, kind);

    this.items.push({
      id: this.itemId++,
      lane,
      y: ITEM_START_Y,
      speed: this.currentItemSpeed(),
      kind,
      sprite,
    });
  }

  private updateItems(delta: number) {
    const seconds = delta / 1000;
    const nextItems: FallingItem[] = [];

    for (const item of this.items) {
      item.y += item.speed * seconds;
      item.sprite.y = item.y;

      const isCollision =
        item.lane === this.playerLane &&
        Math.abs(item.y - PLAYER_Y) <= COLLISION_DISTANCE_Y;

      if (isCollision) {
        item.sprite.destroy();

        if (item.kind === "heart") {
          this.heartsCollected += 1;
          this.currentCombo += 1;
          this.maxCombo = Math.max(this.maxCombo, this.currentCombo);
          this.starsLit = Math.floor(this.heartsCollected / STAR_EVERY_HEARTS);
          this.flash(0xff96d0, 0.12);
        } else {
          this.heartsLeft = Math.max(0, this.heartsLeft - 1);
          this.currentCombo = 0;
          this.flash(0xff6a62, 0.2);

          if (this.heartsLeft <= 0) {
            this.pushRuntimeSnapshot(true);
            this.handlersRef.current.onGameOver({
              lane: this.playerLane,
              heartsLeft: this.heartsLeft,
              heartsCollected: this.heartsCollected,
              starsLit: this.starsLit,
              currentCombo: this.currentCombo,
              maxCombo: this.maxCombo,
              durationMs: Math.max(
                0,
                Math.floor(this.time.now - this.startedAt),
              ),
              cleared: false,
            });
            this.controlRef.current.active = false;
            continue;
          }
        }

        continue;
      }

      if (item.y > CANVAS_HEIGHT + 36) {
        item.sprite.destroy();
        if (item.kind === "heart") {
          this.currentCombo = 0;
        }
        continue;
      }

      nextItems.push(item);
    }

    this.items = nextItems;
  }

  private flash(color: number, alpha: number) {
    if (!this.flashOverlay) return;
    this.flashOverlay.setFillStyle(color, alpha);
    this.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 180,
      ease: "Quad.easeOut",
    });
  }

  private pushRuntimeSnapshot(force = false) {
    const now = this.time.now;
    if (!force && now - this.lastRuntimePushAt < 100) {
      return;
    }
    this.lastRuntimePushAt = now;
    this.handlersRef.current.onRuntime({
      lane: this.playerLane,
      heartsLeft: this.heartsLeft,
      heartsCollected: this.heartsCollected,
      starsLit: this.starsLit,
      currentCombo: this.currentCombo,
      maxCombo: this.maxCombo,
      durationMs: Math.max(0, Math.floor(now - this.startedAt)),
    });
  }

  private pushRuntimeSnapshotIfNeeded(force = false) {
    this.pushRuntimeSnapshot(force);
  }

  resetAndStart() {
    this.controlRef.current.active = true;
    this.controlRef.current.paused = false;
    this.resetRunState();
  }
}

export interface PhaserRunCanvasProps {
  active: boolean;
  paused: boolean;
  className?: string;
  onRuntime: (snapshot: RuntimeSnapshot) => void;
  onGameOver: (snapshot: GameOverSnapshot) => void;
  onLongPress: () => void;
  onSwipeDown: () => void;
}

export function PhaserRunCanvas({
  active,
  paused,
  className,
  onRuntime,
  onGameOver,
  onLongPress,
  onSwipeDown,
}: PhaserRunCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const controlRef = useRef<StageControlState>({ active, paused });
  const handlersRef = useRef<StageSceneHandlers>({
    onRuntime,
    onGameOver,
    onLongPress,
    onSwipeDown,
  });
  const prevActiveRef = useRef(active);

  controlRef.current.active = active;
  controlRef.current.paused = paused;
  handlersRef.current.onRuntime = onRuntime;
  handlersRef.current.onGameOver = onGameOver;
  handlersRef.current.onLongPress = onLongPress;
  handlersRef.current.onSwipeDown = onSwipeDown;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.CANVAS,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      parent: containerRef.current,
      backgroundColor: "#0f2142",
      pixelArt: true,
      scene: [new HeartstarStageScene(handlersRef, controlRef)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || !game.scene) return;

    if (active && !prevActiveRef.current) {
      const scene = game.scene.getScene("stage-scene") as HeartstarStageScene;
      scene.resetAndStart();
    }
    prevActiveRef.current = active;
  }, [active]);

  return <div className={className} ref={containerRef} />;
}
