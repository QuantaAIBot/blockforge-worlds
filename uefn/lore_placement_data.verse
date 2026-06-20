# Generated from LORE placement manifest. Do not edit by hand.
# Source map: RoundTrip-Fixture; seed=1; exportedAt=2026-06-19T02:42:05.196Z.
# Coordinate space: ue5-zup-cm. Values are centimeters in UEFN Z-up space.
using { /UnrealEngine.com/Temporary/SpatialMath }

lore_asset_key := enum:
    block_grass
    block_brick
    prop_crate

lore_placement_row := struct:
    AssetKey : lore_asset_key
    Position : vector3
    YawDeg : float
    Label : string

LORE_GREYBOX_ROWS<public> : []lore_placement_row = array{
    lore_placement_row{AssetKey := lore_asset_key.block_grass, Position := vector3{X := 0.0, Y := 0.0, Z := 0.0}, YawDeg := 0.0, Label := "block:grass"},
    lore_placement_row{AssetKey := lore_asset_key.block_grass, Position := vector3{X := 100.0, Y := 0.0, Z := 0.0}, YawDeg := 0.0, Label := "block:grass"},
    lore_placement_row{AssetKey := lore_asset_key.block_grass, Position := vector3{X := 200.0, Y := 0.0, Z := 0.0}, YawDeg := 0.0, Label := "block:grass"},
    lore_placement_row{AssetKey := lore_asset_key.block_grass, Position := vector3{X := 0.0, Y := 100.0, Z := 0.0}, YawDeg := 0.0, Label := "block:grass"},
    lore_placement_row{AssetKey := lore_asset_key.block_brick, Position := vector3{X := 0.0, Y := 0.0, Z := 100.0}, YawDeg := 0.0, Label := "block:brick"},
}

LORE_PROP_ROWS<public> : []lore_placement_row = array{
    lore_placement_row{AssetKey := lore_asset_key.prop_crate, Position := vector3{X := 200.0, Y := 0.0, Z := 0.0}, YawDeg := -90.0, Label := "prop:crate"},
}
