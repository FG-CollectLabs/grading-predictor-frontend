export interface SetInfo {
  name: string;
  code: string; // pokemontcg.io set code
}

export interface EraGroup {
  era: string;
  sets: SetInfo[];
}

export const POKEMON_SETS: EraGroup[] = [
  {
    era: "Scarlet & Violet",
    sets: [
      { name: "Prismatic Evolutions",   code: "sve"       },
      { name: "Surging Sparks",         code: "sv8"       },
      { name: "Stellar Crown",          code: "sv7"       },
      { name: "Shrouded Fable",         code: "sv6pt5"    },
      { name: "Twilight Masquerade",    code: "sv6"       },
      { name: "Temporal Forces",        code: "sv5"       },
      { name: "Paldean Fates",          code: "sv4pt5"    },
      { name: "Paradox Rift",           code: "sv4"       },
      { name: "151",                    code: "sv3pt5"    },
      { name: "Obsidian Flames",        code: "sv3"       },
      { name: "Paldea Evolved",         code: "sv2"       },
      { name: "Scarlet & Violet",       code: "sv1"       },
    ],
  },
  {
    era: "Sword & Shield",
    sets: [
      { name: "Crown Zenith",           code: "swsh12pt5" },
      { name: "Silver Tempest",         code: "swsh12"    },
      { name: "Lost Origin",            code: "swsh11"    },
      { name: "Pokémon GO",             code: "pgo"       },
      { name: "Astral Radiance",        code: "swsh10"    },
      { name: "Brilliant Stars",        code: "swsh9"     },
      { name: "Fusion Strike",          code: "swsh8"     },
      { name: "Celebrations",           code: "cel25"     },
      { name: "Evolving Skies",         code: "swsh7"     },
      { name: "Chilling Reign",         code: "swsh6"     },
      { name: "Battle Styles",          code: "swsh5"     },
      { name: "Shining Fates",          code: "swsh4pt5"  },
      { name: "Vivid Voltage",          code: "swsh4"     },
      { name: "Darkness Ablaze",        code: "swsh3"     },
      { name: "Rebel Clash",            code: "swsh2"     },
      { name: "Sword & Shield",         code: "swsh1"     },
    ],
  },
  {
    era: "Mega Evolution / XY–SM",
    sets: [
      { name: "Cosmic Eclipse",         code: "sm12"      },
      { name: "Hidden Fates",           code: "hif"       },
      { name: "Unified Minds",          code: "sm11"      },
      { name: "Unbroken Bonds",         code: "sm10"      },
      { name: "Team Up",                code: "sm9"       },
      { name: "Lost Thunder",           code: "sm8"       },
      { name: "Celestial Storm",        code: "sm7"       },
      { name: "Forbidden Light",        code: "sm6"       },
      { name: "Ultra Prism",            code: "sm5"       },
      { name: "Crimson Invasion",       code: "sm4"       },
      { name: "Shining Legends",        code: "sma"       },
      { name: "Burning Shadows",        code: "sm3"       },
      { name: "Guardians Rising",       code: "sm2"       },
      { name: "Sun & Moon",             code: "sm1"       },
      { name: "Evolutions",             code: "xy12"      },
      { name: "Steam Siege",            code: "xy11"      },
      { name: "Fates Collide",          code: "xy10"      },
      { name: "BREAKpoint",             code: "xy9"       },
      { name: "BREAKthrough",           code: "xy8"       },
      { name: "Ancient Origins",        code: "xy7"       },
      { name: "Roaring Skies",          code: "xy6"       },
      { name: "Primal Clash",           code: "xy5"       },
      { name: "Phantom Forces",         code: "xy4"       },
      { name: "Furious Fists",          code: "xy3"       },
      { name: "Flashfire",              code: "xy2"       },
      { name: "XY",                     code: "xy1"       },
    ],
  },
];
