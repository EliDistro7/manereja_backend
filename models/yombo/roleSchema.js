const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  roles: {
    type: Map,
    of: {
      defaultPositions: [String], // Optional default leadership positions for each leader role
    },
    default: new Map([
      ["umoja_wa_vijana", {}],
      ["kiongozi_umoja_wa_vijana", { defaultPositions: ["Mwenyekiti", "Katibu", "Mhasibu"] }],
      ["kwaya_ya_umoja_wa_vijana", {}],
      ["kiongozi_kwaya_ya_umoja_wa_vijana", { defaultPositions: ["Mwenyekiti", "Mwalimu wa Muziki", "Katibu"] }],
      ["kwaya_kuu", {}],
      ["kiongozi_kwaya_kuu", { defaultPositions: ["Mwenyekiti", "Mwalimu wa Muziki", "Mweka Hazina"] }],
      ["kwaya_ya_wamama", {}],
      ["kiongozi_kwaya_ya_wamama", { defaultPositions: ["Mwenyekiti", "Katibu", "Mhasibu"] }],
      ["kwaya_ya_vijana", {}],
      ["kiongozi_kwaya_ya_vijana", { defaultPositions: ["Mwenyekiti", "Katibu", "Mhasibu"] }],
      ["praise_team", {}],
      ["kiongozi_praise_team", { defaultPositions: ["Mwalimu wa Muziki", "Mwenyekiti"] }],
      ["kwaya_ya_uinjilisti", {defaultPositions: ["Mwalimu wa Muziki", "Mwenyekiti"]}],
      ["kiongozi_kwaya_ya_uinjilsti", { defaultPositions: ["Mwenyekiti", "Katibu", "Mweka Hazina"] }],
      ["wababa_kati", {}],
      ["kiongozi_wababa_kati", { defaultPositions: ["Mwenyekiti", "Katibu"] }],
      ["umoja_wa_wanaume", {}],
      ["kiongozi_umoja_wa_wanaume", { defaultPositions: ["Mwenyekiti", "Katibu", "Mhasibu"] }],
      ["baraza_la_wazee", {}],
      ["kiongozi_baraza_la_wazee", { defaultPositions: ["Mwenyekiti", "Katibu"] }],
      ["umoja_wa_wanawake", {}],
      ["kiongozi_umoja_wa_wanawake", { defaultPositions: ["Mwenyekiti", "Katibu", "Mweka Hazina"] }],
      ["wamama", {}],
      ["darasa_la_nikodemo", {}],
      ["kiongozi_darasa_la_nikodemo", { defaultPositions: ["Mwalimu Mkuu", "Katibu"] }],
      ["shule_ya_jumapili", {}],
      ["kiongozi_shule_ya_jumapili", { defaultPositions: ["Mwalimu Mkuu", "Katibu"] }],
      ["kiongozi_wamama", { defaultPositions: ["Mwenyekiti", "Mweka Hazina"] }],
      ["wababa", {}],
      ["kiongozi_wababa", { defaultPositions: ["Mwenyekiti", "Katibu"] }],
      ["jumuiya_kanisani", {}],
      ["jumuiya_malawi", {}],
      ["jumuiya_golani", {}],
      ["kiongozi_jumuiya_kanisani", { defaultPositions: ["Mwenyekiti", "Katibu", "Mweka Hazina"] }],
      ["kiongozi_jumuiya_malawi", { defaultPositions: ["Mwenyekiti", "Katibu"] }],
      ["kiongozi_jumuiya_golani", { defaultPositions: ["Mwenyekiti", "Katibu"] }],
    ]),
  },
});

const Roles = mongoose.model('Roles', roleSchema);

module.exports = Roles;
