// Which pieces of each downloaded pack become scenery assets, and how they're used.
//
// asset fields
//   id      unique name used in tracks / the generator
//   pack    zip name (without .zip); node: node name, /regex/ or index (see `node bake.mjs --auto`)
//   cat     building | tree | bush | prop | lamp | sign | fence | vehicle | landmark | skyline
//   cls     buildings: kiosk | shop | midrise | highrise | tower | industrial | warehouse | house
//           props: bin | dumpster | vending | phone | meter | mailbox | barrier | crate | barrel | trash | debris |
//                  container | ac | panel | tyre | bags
//   tags    settings it suits: town city downtown suburb industrial docks forest country japan desert night
//   scale / targetH / yaw   fix the pack's units (metres) and turn the front to +Z
//   w       relative pick weight (default 1)
export const PACKS = {
  buildings: { tex: 256 },
  buildings__ps1_asset_pack: { tex: 256 },
  casa_abandonada_2: { tex: 256 },
  city_at_night_low_poly_skyscrapers: { tex: 256 },
  'downtown_buildings_set_-_low_poly_model': { tex: 512 },
  dumpster: { tex: 128 },
  ford_transit_1999: { tex: 256 },
  'industrial_buildings_set_-_low_poly_models': { tex: 512 },
  laundry_props: { tex: 256 },
  'low-poly_urban_street_props_pack_ps1_style': { tex: 128 },
  low_poly_street_gameready_6: { tex: 128 },
  low_poly_vegetation_patch: { tex: 256 },
  pack_japanes_city: { tex: 128 },
  pine_trees_pack__ps1_low_poly: { tex: 256 },
  psx_abandoned_church: { tex: 256 },
  psx_industrial_pack: { tex: 256 },
  psx_japanese_warehouse: { tex: 256 },
  psx_style_chain_fence: { tex: 128 },
  psx_style_concrete_barriers: { tex: 128 },
  street_city_7_for_games_free: { tex: 256 },
  street_city_buildings_8: { tex: 256 },
  street_phone: { tex: 128 },
  taiwan_style_signboard_lowpoly: { tex: 128 },
  trash_and_debris: { tex: 128 },
  trees_and_bush_pack_lowpoly: { tex: 256 },
  vending_machine_psx: { tex: 128 },
  // loose .glb files (no Sketchfab licence file: credit given here)
  ultimate_retro_tree_pack: { tex: 256, dir: 'ultimate_retro_tree_pack/ultimate_retro_tree_pack/glb', credit: { title: 'Ultimate Retro Tree Pack', author: 'unknown (no licence file in the download)', license: 'see the original download page', source: '' } },
  low_poly_forest_tree_pack: { tex: 256 },
  psx_birch_tree: { tex: 256 },
};

const A = [];
const add = (pack, common, list) => { for (const e of list) A.push({ pack, ...common, ...e }); };

// ---------------- buildings ----------------
// Elbolillo: brick / render blocks with shopfronts on the ground floor (fronts face +Z)
add('buildings', { cat: 'building', cls: 'midrise', tags: ['town', 'city', 'downtown'] }, [
  { id: 'eb_block_03', node: 'Building_03' }, { id: 'eb_block_01', node: 'Building_01' }, { id: 'eb_block_00', node: 'Building' },
  { id: 'eb_block_02', node: 'Building_02' }, { id: 'eb_block_04', node: 'Building_04' }, { id: 'eb_block_09', node: 'Building_09', cls: 'shop' },
  { id: 'eb_block_05', node: 'Building_05' }, { id: 'eb_block_07', node: 'Building_07', cls: 'shop' }, { id: 'eb_block_08', node: 'Building_08', cls: 'shop' },
  { id: 'eb_block_06', node: 'Building_06' },
]);
// McPato PS1 pack: condos + small restaurants / shops, lamp posts
add('buildings__ps1_asset_pack', { cat: 'building', tags: ['town', 'city', 'suburb'] }, [
  { id: 'mp_condo_a', node: 3, cls: 'midrise' }, { id: 'mp_condo_b', node: 5, cls: 'midrise' }, { id: 'mp_condo_c', node: 23, cls: 'midrise' },
  { id: 'mp_condo_d', node: 25, cls: 'midrise' }, { id: 'mp_condo_small', node: 21, cls: 'midrise' }, { id: 'mp_hotel', node: 32, cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'mp_restaurant', node: 7, cls: 'kiosk' }, { id: 'mp_polleria', node: 9, cls: 'shop' }, { id: 'mp_bar', node: 15, cls: 'shop' },
  { id: 'mp_pizzeria', node: 17, yaw: 180, cls: 'shop' }, { id: 'mp_kiosk', node: 19, yaw: 180, cls: 'kiosk' }, { id: 'mp_pharmacy', node: 27, yaw: 180, cls: 'shop' },
  { id: 'mp_burger', node: 30, yaw: 180, cls: 'shop' }, { id: 'mp_corner_shop', node: 50, yaw: 180, cls: 'kiosk' },
]);
add('buildings__ps1_asset_pack', { cat: 'lamp', cls: 'street', tags: ['town', 'city', 'suburb', 'downtown'] }, [{ id: 'mp_lamp', node: 55 }]);
// downtown towers (Daniel Zhabotinsky)
add('downtown_buildings_set_-_low_poly_model', { cat: 'building', tags: ['city', 'downtown'] }, [
  { id: 'dt_brownstone_a', node: 'Downtown_BrownstoneOffice_1', cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'dt_brownstone_b', node: 'Downtown_BrownstoneOffice_2', cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'dt_classic', node: 'Downtown_ClassicOffice_1', cls: 'highrise' },
  { id: 'dt_flatiron', node: 'Downtown_Flatiron_1', cls: 'tower', w: 0.5 },
  { id: 'dt_mall', node: 'Downtown_Mall_1', cls: 'midrise' },
  { id: 'dt_modern_2', node: 'Downtown_ModernOffice_2', cls: 'midrise' },
  { id: 'dt_modern_3', node: 'Downtown_ModernOffice_3', cls: 'midrise' },
  { id: 'dt_modern_4', node: 'Downtown_ModernOffice_4', cls: 'tower' },
  { id: 'dt_modern_5', node: 'Downtown_ModernOffice_5', cls: 'tower' },
  { id: 'dt_modern_5b', node: 'Downtown_ModernOffice_5_B', cls: 'highrise' },
  { id: 'dt_public', node: 'Downtown_PublicBuilding_1', cls: 'midrise' },
  { id: 'dt_resi_2', node: 'Downtown_Residential_2', cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'dt_resi_3', node: 'Downtown_Residential_3', cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'dt_resi_4', node: 'Downtown_Residential_4', cls: 'midrise', tags: ['city', 'downtown', 'town'] },
  { id: 'dt_brutal', node: 'Downtown_Brutal_1', cls: 'midrise' },
  { id: 'dt_modern_1', node: 'Downtown_ModernOffice_1', cls: 'highrise' },
  { id: 'dt_modern_1b', node: 'Downtown_ModernOffice_1_B', cls: 'highrise' },
  { id: 'dt_artdeco', node: 'Downtown_ArtDeco_1', cls: 'highrise' },
]);
// industrial set
add('industrial_buildings_set_-_low_poly_models', { cat: 'building', cls: 'industrial', tags: ['industrial', 'docks'] }, [
  { id: 'in_building_1', node: 'Industrial_Building_1' }, { id: 'in_building_10', node: 'Industrial_Building_10' },
  { id: 'in_duplex', node: 'Industrial_Duplex_1', tags: ['industrial', 'docks', 'town'] },
  { id: 'in_factory_1', node: 'Industrial_FactoryPlant_1', cls: 'warehouse' }, { id: 'in_factory_2', node: 'Industrial_FactoryPlant_2', cls: 'warehouse' },
  { id: 'in_hut_2', node: 'Industrial_GenericBuilding_2', cls: 'kiosk', tags: ['industrial', 'docks', 'country'] },
  { id: 'in_hut_3', node: 'Industrial_GenericBuilding_3', cls: 'kiosk', tags: ['industrial', 'docks', 'country'] },
  { id: 'in_long_4', node: 'Industrial_GenericBuilding_4', cls: 'warehouse' },
  { id: 'in_hangar', node: 'Industrial_Hangar_2', cls: 'warehouse' }, { id: 'in_terminal', node: 'Industrial_LogisticTerminal_1', cls: 'warehouse' },
  { id: 'in_trailer', node: 'Industrial_OfficeTrailer_1', cls: 'kiosk' },
  { id: 'in_shed', node: 'Industrial_Railroad_Loadbay_Shed_1', cls: 'warehouse' },
  { id: 'in_plant_1', node: 'Industrial_Smth_1' }, { id: 'in_plant_2', node: 'Industrial_Smth_2' },
  { id: 'in_warehouse_1', node: 'Industrial_Warehouse_1', cls: 'warehouse' }, { id: 'in_warehouse_3', node: 'Industrial_Warehouse_3', cls: 'warehouse', tags: ['industrial', 'docks', 'country'] },
  { id: 'in_warehouse_4', node: 'Industrial_Warehouse_4', cls: 'warehouse' }, { id: 'in_warehouse_5', node: 'Industrial_Warehouse_5', cls: 'warehouse' },
  { id: 'in_warehouse_small', node: 'Industrial_WarehouseSmall_4', cls: 'kiosk', tags: ['industrial', 'docks', 'country'] },
]);
add('industrial_buildings_set_-_low_poly_models', { cat: 'landmark', tags: ['industrial', 'docks'] }, [
  { id: 'in_crane', node: 'Industrial_PortalCrane_2', tags: ['docks'] }, { id: 'in_radio', node: 'Industrial_Radiotower_1', tags: ['industrial', 'country', 'town'] },
  { id: 'in_tank_1', node: 'Industrial_Tank_1' }, { id: 'in_tank_2', node: 'Industrial_Tank_2' }, { id: 'in_substation', node: 'Industrial_TsrStation_1' },
  { id: 'in_watertower', node: 'Industrial_Watertower_1', tags: ['industrial', 'country', 'town'] }, { id: 'in_powerplant', node: 'Industrial_Powerplant_1', w: 0.3 },
  { id: 'in_chimney_5', node: 'Industrial_Tank_5' }, { id: 'in_chimney_4', node: 'Industrial_Tank_4' },
  { id: 'in_silo', node: 'Industrial_SiloTank_1', tags: ['industrial', 'country'] }, { id: 'in_tank_3', node: 'Industrial_Tank_3_Walls' },
]);
// dasy444 street pack: 3-4 storey brick blocks and panel towers (modelled at ~1:4.5)
add('street_city_7_for_games_free', { cat: 'building', scale: 4.5, tags: ['city', 'town'] }, [
  ...[3, 5, 8, 11, 14, 16, 19, 22, 24, 26, 29, 41, 84, 87, 91, 100, 102, 105, 107, 110, 112, 114, 117, 123, 132, 135, 137, 140, 145, 148]
    .map(n => ({ id: 'sc_block_' + n, node: n, cls: 'shop' })),
  ...[32, 35, 38, 53, 151, 153, 155, 157].map(n => ({ id: 'sc_panel_' + n, node: n, cls: 'highrise', tags: ['city', 'downtown'] })),
]);
add('street_city_7_for_games_free', { cat: 'prop', cls: 'bin', scale: 4.5, tags: ['city', 'town', 'suburb', 'downtown'] }, [{ id: 'sc_bin', node: 56 }]);
add('street_city_7_for_games_free', { cat: 'lamp', cls: 'street', scale: 6, tags: ['city', 'town', 'downtown', 'industrial'] }, [{ id: 'sc_lamp', node: 162 }]);
// Soviet-style panel blocks (modelled at ~1:12)
add('street_city_buildings_8', { cat: 'building', cls: 'highrise', scale: 12, tags: ['city', 'industrial'] }, [
  ...[3, 7, 11, 19, 59, 63, 71].map(n => ({ id: 'pb_block_' + n, node: n })),
  ...[79, 81, 89, 105, 109].map(n => ({ id: 'pb_slab_' + n, node: n, cls: 'midrise' })),
]);
// laundromat street (Elbolillo): single-storey shops
add('laundry_props', { cat: 'building', cls: 'shop', tags: ['town', 'suburb', 'city'] }, [
  { id: 'lp_shops_a', node: 'building_001' }, { id: 'lp_shops_b', node: 'building_01' }, { id: 'lp_shops_c', node: 'building_02' },
  { id: 'lp_house', node: 'building_03', cls: 'house', tags: ['town', 'suburb', 'country'] }, { id: 'lp_shops_e', node: 'building_04', cls: 'midrise' }, { id: 'lp_laundromat', node: 'Laundry_building', cls: 'kiosk' },
]);
add('laundry_props', { cat: 'tree', cls: 'thin', tags: ['town', 'suburb', 'city'] }, [
  { id: 'lp_tree_a', node: 'Tree_01' }, { id: 'lp_tree_b', node: 'Tree_02' }, { id: 'lp_tree_c', node: 'Tree' },
]);
add('laundry_props', { cat: 'bush', tags: ['town', 'suburb', 'city'] }, [{ id: 'lp_shrub', node: 'Tree_03' }, { id: 'lp_flowers', node: 'plants_flowers' }]);
add('laundry_props', { cat: 'prop', tags: ['town', 'suburb', 'city'] }, [
  { id: 'lp_vending', node: 'Vending_machine', cls: 'vending', yaw: -90 }, { id: 'lp_bin', node: 'trash_can_01', cls: 'bin' },
  { id: 'lp_bag_a', node: 'Garbage_bag_02', cls: 'bags' }, { id: 'lp_bag_b', node: 'Garbage_bag', cls: 'bags' }, { id: 'lp_bag_c', node: 'Garbage_bag_01', cls: 'bags' },
]);
add('laundry_props', { cat: 'lamp', cls: 'street', tags: ['town', 'suburb'] }, [{ id: 'lp_lamp', node: 'Lamppost_001' }]);
// odd buildings / landmarks
add('casa_abandonada_2', { cat: 'building', cls: 'house', tags: ['town', 'suburb', 'country', 'desert'] }, [{ id: 'casa_house', node: 'Cube' }]);
add('psx_abandoned_church', { cat: 'landmark', tags: ['town', 'country', 'forest', 'desert'], scale: 1.4 }, [{ id: 'church', node: 'PSX Abandoned Church' }]);
add('psx_japanese_warehouse', { cat: 'building', cls: 'warehouse', scale: 2.2, tags: ['industrial', 'docks', 'japan', 'country'] }, [{ id: 'jp_warehouse', node: ['PSX Warehouse', 'Props'] }]);
add('psx_industrial_pack', { cat: 'building', tags: ['industrial', 'docks', 'country'] }, [
  { id: 'pi_garage', node: 'Building01', cls: 'warehouse' }, { id: 'pi_workshop', node: 'Building02', cls: 'warehouse' }, { id: 'pi_shed', node: 'Cube', cls: 'warehouse' },
]);
add('psx_industrial_pack', { cat: 'prop', tags: ['industrial', 'docks'] }, [
  { id: 'pi_container', node: 'Container01', cls: 'container' }, { id: 'pi_skip_a', node: 'Trashcan01', cls: 'dumpster' }, { id: 'pi_skip_b', node: 'Trashcan2', cls: 'dumpster' },
  { id: 'pi_panel', node: 'ElectricalPanel', cls: 'panel', tags: ['industrial', 'docks', 'city', 'town'] }, { id: 'pi_ac', node: 'Ventilation_1', cls: 'ac', tags: ['industrial', 'city', 'town'] },
]);
add('psx_industrial_pack', { cat: 'landmark', tags: ['industrial', 'docks', 'country'] }, [{ id: 'pi_silo', node: 'LiquidReservoir' }]);
// night skyline (lit windows baked into the textures), modelled tiny
add('city_at_night_low_poly_skyscrapers', { cat: 'skyline', scale: 22, tags: ['city', 'downtown', 'night'] }, [
  ...[3, 6, 9, 12, 15, 17, 19, 21, 24].map(n => ({ id: 'ns_tower_' + n, node: n })),
  ...[27, 29, 31, 33, 35, 37].map(n => ({ id: 'ns_block_' + n, node: n })),
]);

// ---------------- vegetation ----------------
add('pine_trees_pack__ps1_low_poly', { cat: 'tree', cls: 'pine', tags: ['forest', 'country', 'town', 'suburb'] }, [
  { id: 'pine_a', node: 'Tree_Pine_T1' }, { id: 'pine_b', node: 'Tree_Pine_T2' }, { id: 'pine_c', node: 'Tree_Pine_T3' },
]);
add('trees_and_bush_pack_lowpoly', { cat: 'tree', tags: ['forest', 'country', 'town', 'suburb'] }, [
  { id: 'tb_pine_a', node: 'pine1', cls: 'pine', targetH: 16 }, { id: 'tb_pine_b', node: 'Pine2', cls: 'pine', targetH: 14 },
  { id: 'tb_oak', node: 'tree2', cls: 'broad', targetH: 9, tags: ['forest', 'country', 'town', 'suburb', 'city'] },
  { id: 'tb_tree_small', node: 'TreeSmall', cls: 'broad', targetH: 6.5, tags: ['forest', 'country', 'town', 'suburb', 'city'] },
]);
add('trees_and_bush_pack_lowpoly', { cat: 'bush', tags: ['forest', 'country', 'town', 'suburb', 'city'] }, [
  { id: 'tb_bush_big', node: 'BushBig2', targetH: 1.6 }, { id: 'tb_bush_flower', node: 'BushFlowerSmall', targetH: 1.2 },
  { id: 'tb_bush_med', node: 'BushMed', targetH: 1.5 }, { id: 'tb_bush_med2', node: 'BushMed2', targetH: 1.4 },
  { id: 'tb_bush_small', node: 'BushSmall', targetH: 0.9 }, { id: 'tb_bush_small2', node: 'BushSmall2', targetH: 0.9 },
  { id: 'tb_bush_mound', node: 'MushBig', targetH: 2 },
]);
add('low_poly_vegetation_patch', { cat: 'tree', cls: 'broad', tags: ['forest', 'country', 'town', 'suburb'] }, [
  { id: 'vp_tree_a', node: 'Object_4' }, { id: 'vp_tree_b', node: 'Object_14' },
]);
add('low_poly_vegetation_patch', { cat: 'bush', tags: ['forest', 'country', 'suburb'] }, [
  { id: 'vp_bush_a', node: 'Object_6', targetH: 2.6 }, { id: 'vp_bush_b', node: 'Object_7', targetH: 1.8 },
  { id: 'vp_bush_c', node: 'Object_16', targetH: 2.2 }, { id: 'vp_plant', node: 'Object_9', targetH: 1 },
]);

// Ultimate Retro Tree Pack: 120 photo-textured cross-plane trees (each its own .glb, all ~3-5 m tall: sized here)
// tree classes: broad | thin | pine | blossom | autumn | palm | desert | bare | willow | birch
const retro = (cls, tags, list) => add('ultimate_retro_tree_pack', { cat: 'tree', cls, tags }, list.map(([n, h, extra]) => ({ id: 'rt_' + cls + '_' + n, file: `tree${n}.glb`, targetH: h, ...(extra || {}) })));
retro('blossom', ['blossom', 'japan', 'park', 'town'], [['067', 8], ['068', 7.5], ['069', 8], ['070', 7.5, { w: 0.45 }], ['071', 7], ['072', 7.5, { w: 0.45 }], ['073', 7, { w: 0.6 }], ['074', 6.5, { w: 0.6 }]]);
retro('autumn', ['autumn', 'forest', 'country', 'town'], [['011', 9], ['012', 10], ['013', 10.5], ['014', 11], ['015', 9.5], ['016', 8.5], ['017', 10], ['019', 11], ['020', 10], ['021', 9.5], ['025', 10], ['026', 9], ['028', 10], ['030', 10.5]]);
retro('broad', ['forest', 'country', 'town', 'suburb', 'park', 'city'], [['018', 8], ['023', 9], ['024', 8.5], ['027', 9], ['080', 9], ['082', 11], ['083', 10], ['085', 9.5], ['086', 9.5], ['095', 10], ['097', 9], ['098', 10], ['106', 10], ['110', 10], ['113', 9], ['114', 10], ['119', 9.5]]);
retro('palm', ['coast', 'tropical', 'desert'], [['031', 11], ['032', 12], ['033', 10.5], ['034', 12], ['035', 11.5], ['036', 10], ['038', 12.5]]);
retro('desert', ['desert'], [['043', 5], ['049', 6], ['050', 6.5], ['051', 6], ['047', 7.5]]);
retro('bare', ['winter', 'forest', 'country', 'town'], [['001', 9], ['003', 10], ['005', 10], ['008', 9.5], ['009', 9]]);
retro('pine', ['forest', 'country', 'mountain'], [['045', 12], ['055', 13], ['056', 15], ['057', 14], ['059', 11], ['060', 12], ['061', 13], ['062', 12], ['063', 11], ['064', 14], ['066', 12]]);
retro('willow', ['park', 'country', 'town'], [['076', 9]]);
add('ultimate_retro_tree_pack', { cat: 'bush', cls: 'flower', tags: ['blossom', 'park', 'town'] }, [{ id: 'rt_bush_flower', file: 'tree075.glb', targetH: 3 }]);
// Low Poly Forest Tree Pack (99.Miles): tall conifers, a few detailed trees, grass tufts, shrubs and rocks
add('low_poly_forest_tree_pack', { cat: 'tree', cls: 'pine', tags: ['forest', 'country', 'mountain'] }, [
  { id: 'fp_fir_a', node: 'Background_Tree_Atlas', targetH: 17 }, { id: 'fp_larch_a', node: 'Background_Tree_Atlas.001', targetH: 17, cls: 'autumn', tags: ['autumn', 'forest', 'country'] },
  { id: 'fp_fir_c', node: 'Background_Tree_Atlas.002', targetH: 12 }, { id: 'fp_fir_d', node: 'Background_Tree_Atlas.003', targetH: 17 },
  { id: 'fp_larch_b', node: 'Background_Tree_Atlas.004', targetH: 15, cls: 'autumn', tags: ['autumn', 'forest', 'country'] }, { id: 'fp_fir_f', node: 'Background_Tree_Atlas.005', targetH: 21 },
  { id: 'fp_fir_g', node: 'Background_Tree_Atlas.006', targetH: 17 }, { id: 'fp_fir_h', node: 'Background_Tree_Atlas.007', targetH: 17 },
  { id: 'fp_pine_tall', node: ['Tree_Branches_01', 'Tree_Trunk_01.001'], targetH: 18 },
  { id: 'fp_pine_mid', node: ['Tree_Branches_01.002', 'Tree_Trunk_01.002'], targetH: 14 },
  { id: 'fp_pine_small', node: ['Tree_Branches_01.001', 'Tree_Trunk_01'], targetH: 8 },
]);
add('low_poly_forest_tree_pack', { cat: 'tree', cls: 'autumn', tags: ['autumn', 'forest', 'country'] }, [{ id: 'fp_aspen', node: ['Tree_Branches_02', 'Tree_Trunk_02'], targetH: 10 }]);
add('low_poly_forest_tree_pack', { cat: 'bush', tags: ['forest', 'country', 'mountain'] }, [
  { id: 'fp_sapling', node: 'Background_Tree_Atlas.009', targetH: 3 }, { id: 'fp_shrub', node: 'Background_Tree_Atlas.010', targetH: 1.4 },
]);
add('low_poly_forest_tree_pack', { cat: 'grass', tags: ['forest', 'country', 'mountain', 'park'] }, [
  { id: 'fp_grass_a', node: 'Background_Tree_Atlas.008', targetH: 0.9 }, { id: 'fp_grass_b', node: 'Background_Tree_Atlas.011', targetH: 0.8 },
  { id: 'fp_grass_c', node: 'Background_Tree_Atlas.012', targetH: 0.9 },
]);
add('low_poly_forest_tree_pack', { cat: 'rock', tags: ['forest', 'country', 'mountain', 'desert'] }, [
  { id: 'fp_rock_a', node: 'Rocks.001', scale: 1 }, { id: 'fp_rock_b', node: 'Rocks.002', scale: 1 }, { id: 'fp_rock_c', node: 'Rocks.005', scale: 1 },
  { id: 'fp_rock_d', node: 'Rocks.006', scale: 1 }, { id: 'fp_rock_e', node: 'Rocks.004', scale: 1 }, { id: 'fp_rock_f', node: 'Rocks.007', scale: 1 },
]);
add('psx_birch_tree', { cat: 'tree', cls: 'birch', tags: ['forest', 'country', 'town', 'park'] }, [{ id: 'birch', node: 'birch-2', targetH: 12 }]);

// ---------------- street furniture ----------------
add('low-poly_urban_street_props_pack_ps1_style', { cat: 'prop', tags: ['city', 'town', 'suburb', 'downtown'] }, [
  { id: 'up_phonebox_a', node: 'Body', cls: 'phone' }, { id: 'up_phonebox_b', node: 'Body.001', cls: 'phone' }, { id: 'up_phonebox_broken', node: 'Body.002', cls: 'phone', w: 0.4 },
  { id: 'up_meter_a', node: 'Cone', cls: 'meter' }, { id: 'up_meter_b', node: 'Cone.001', cls: 'meter' }, { id: 'up_meter_c', node: 'Cone.002', cls: 'meter' },
  { id: 'up_mailbox_a', node: 'MailBox1', cls: 'mailbox' }, { id: 'up_mailbox_b', node: 'MailBox2', cls: 'mailbox', w: 0.4 }, { id: 'up_newsbox', node: 'MailBox3', cls: 'mailbox' },
  { id: 'up_soda_a', node: 'SodaMachine', cls: 'vending' }, { id: 'up_soda_b', node: 'SodaMachine.002', cls: 'vending' }, { id: 'up_soda_c', node: 'SodaMachine.004', cls: 'vending', w: 0.4 },
  { id: 'up_bin_a', node: 'Tank.001', cls: 'bin' }, { id: 'up_bin_b', node: 'Tank.002', cls: 'bin' }, { id: 'up_bin_c', node: 'Tank.003', cls: 'bin' },
  { id: 'up_barrier_a', node: 'barriers1', cls: 'barrier', tags: ['city', 'town', 'industrial', 'docks'] },
  { id: 'up_barrier_b', node: 'barriers2', cls: 'barrier', tags: ['city', 'industrial', 'docks'] },
  { id: 'up_barrier_c', node: 'barriers3', cls: 'barrier', tags: ['city', 'industrial', 'docks'] },
]);
add('street_phone', { cat: 'prop', cls: 'phone', targetH: 2.2, tags: ['city', 'town', 'suburb', 'downtown'] }, [{ id: 'payphone', node: 'o_phone001' }]);
add('vending_machine_psx', { cat: 'prop', cls: 'vending', tags: ['city', 'town', 'suburb', 'japan', 'downtown'] }, [{ id: 'vending_psx', node: 'Cube' }]);
add('dumpster', { cat: 'prop', cls: 'dumpster', scale: 0.62, tags: ['city', 'town', 'industrial', 'downtown'] }, [{ id: 'dumpster', node: ['Cube', 'Cube.001', 'Cube.002', 'Cube.003', 'Plane', 'Cube.004'] }]);
add('psx_style_concrete_barriers', { cat: 'prop', cls: 'barrier', scale: 1.2, tags: ['city', 'industrial', 'docks', 'downtown'] }, [
  { id: 'jersey_a', node: 'Jersey_barrier' }, { id: 'jersey_b', node: 'Jersey_barrier_dirty' },
  { id: 'jersey_broken_a', node: 'Jersey_barrier_broken_center', w: 0.4 }, { id: 'jersey_broken_b', node: 'Jersey_barrier_broken_edge_dirty', w: 0.4 },
]);
add('psx_style_chain_fence', { cat: 'fence', cls: 'chain', tags: ['industrial', 'docks', 'city', 'country'], scale: 1.25 }, [
  { id: 'fence_chain_a', node: 'TexturesCom_MetalVarious0026_1_seamless_S.002_31' }, { id: 'fence_chain_b', node: 'Cylinder.004_33' },
]);
add('low_poly_street_gameready_6', { cat: 'prop', tags: ['industrial', 'docks', 'city'] }, [
  ...[3, 7, 11, 19].map(n => ({ id: 'crate_' + n, node: n, cls: 'crate', scale: 2.2 })),
  ...[25, 27, 29].map(n => ({ id: 'barrel_' + n, node: n, cls: 'barrel', scale: 1.7 })),
]);
add('trash_and_debris', { cat: 'prop', tags: ['city', 'industrial', 'docks', 'town', 'downtown'] }, [
  { id: 'td_barrier', node: 'Barriar', cls: 'barrier' }, { id: 'td_barrier_broken', node: 'FracturedBarriar', cls: 'barrier', w: 0.5 },
  { id: 'td_box_a', node: 'CardboardBox_1', cls: 'trash', scale: 0.6 }, { id: 'td_box_b', node: 'CardboardBox_2', cls: 'trash', scale: 0.6 }, { id: 'td_box_c', node: 'CardboardBox_3', cls: 'trash', scale: 0.6 },
  { id: 'td_cinder', node: 'Cinder_Block_1', cls: 'debris', scale: 0.4 }, { id: 'td_rubble_a', node: 'Concrete_Debris_1', cls: 'debris' }, { id: 'td_rubble_b', node: 'Concrete_Debris_2', cls: 'debris' },
  { id: 'td_bag_a', node: 'TrashBag_1', cls: 'bags', scale: 0.38 }, { id: 'td_bag_b', node: 'TrashBag_2', cls: 'bags', scale: 0.42 },
  { id: 'td_tyre_a', node: 'Wheel_1', cls: 'tyre', scale: 0.36 }, { id: 'td_tyre_b', node: 'Wheel_2', cls: 'tyre', scale: 0.36 },
  { id: 'td_planks', node: 'Wooden_Plank_1', cls: 'debris' }, { id: 'td_gascan', node: 'GasCan', cls: 'trash', scale: 0.5 },
  { id: 'td_news2', node: 'News_2', cls: 'litter', scale: 0.55 }, { id: 'td_paper', node: 'Paper_1', cls: 'litter', scale: 0.5 }, { id: 'td_flatcan', node: 'Flat_Can_2', cls: 'litter', scale: 0.5 },
  ...['Can_1_Crushed', 'Can_3_Crushed', 'Can_4_Crushed', 'Can_6', 'Coffee_Cup_Crushed', 'Soda_Cup_Crushed', 'GlassBottle_2', 'GlassBottle_3_Broken', 'Chip_Bag_1', 'Chip_Bag_4', 'Paper_Bag_3', 'CardboardBox_4']
    .map(n => ({ id: 'td_' + n.toLowerCase(), node: n, cls: 'junk', scale: n === 'CardboardBox_4' ? 0.5 : 0.75 })),
  { id: 'td_news', node: 'News_1', cls: 'litter', scale: 0.5 }, { id: 'td_litter_a', node: 'Litter_1', cls: 'litter', scale: 0.6 }, { id: 'td_litter_b', node: 'Litter_2', cls: 'litter', scale: 0.6 },
]);
add('taiwan_style_signboard_lowpoly', { cat: 'sign', scale: 0.3, tags: ['japan', 'city'] }, [
  ...['board31', 'board30', 'board26', 'board24', 'board22', 'board19', 'board17', 'board14', 'board12', 'board11', 'board10', 'board09', 'board07', 'board04', 'board03', 'board02', 'board01']
    .map(n => ({ id: 'tw_' + n, node: n })),
]);
add('pack_japanes_city', { cat: 'building', cls: 'facade', scale: 1.6, tags: ['japan'] }, [
  ...['Wall1', 'Wall2', 'Wall3', 'Wall4', 'Wall5', 'Wall6'].map(n => ({ id: 'jp_' + n.toLowerCase(), node: n })),
]);
add('pack_japanes_city', { cat: 'lamp', cls: 'street', scale: 1, tags: ['japan'] }, [{ id: 'jp_lamp', node: 'lamppost' }]);
add('pack_japanes_city', { cat: 'sign', scale: 1.2, tags: ['japan'] }, [
  { id: 'jp_sign_a', node: 'signboard1' }, { id: 'jp_sign_b', node: 'signboard2' }, { id: 'jp_sign_c', node: 'signboard3' },
]);
add('ford_transit_1999', { cat: 'vehicle', cls: 'van', tags: ['city', 'town', 'industrial', 'suburb', 'docks'] }, [{ id: 'van_transit', node: 'Plane_2' }]);

export const ASSETS = A;
