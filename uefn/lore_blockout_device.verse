# Generated from LORE placement manifest. Do not edit by hand.
# V1 fixture path only: runtime SpawnProp is capped and is not the production real-map assembly path.
using { /Fortnite.com/Devices }
using { /Verse.org/Simulation }
using { /UnrealEngine.com/Temporary/Diagnostics }
using { /UnrealEngine.com/Temporary/SpatialMath }

lore_blockout_device := class(creative_device):
    @editable
    BlockGrassAsset : creative_prop_asset = DefaultCreativePropAsset # block:grass

    @editable
    BlockBrickAsset : creative_prop_asset = DefaultCreativePropAsset # block:brick

    @editable
    PropCrateAsset : creative_prop_asset = DefaultCreativePropAsset # prop:crate

    OnBegin<override>()<suspends>:void=
        Print("LORE blockout fixture spawning 6 prop(s) from RoundTrip-Fixture")
        SpawnRows(LORE_GREYBOX_ROWS)
        SpawnRows(LORE_PROP_ROWS)

    SpawnRows(Rows : []lore_placement_row):void=
        for (Row : Rows):
            Asset := AssetForKey(Row.AssetKey)
            Rotation := MakeRotationFromYawPitchRollDegrees(Row.YawDeg, 0.0, 0.0)
            SpawnResult := SpawnProp(Asset, Row.Position, Rotation)
            if (SpawnResult(0)?):
                Print("LORE spawned {Row.Label}")
            else:
                Print("LORE SpawnProp failed for {Row.Label}; check asset binding and SpawnProp limits")

    AssetForKey(Key : lore_asset_key):creative_prop_asset=
        if (Key = lore_asset_key.block_grass):
            BlockGrassAsset
        else if (Key = lore_asset_key.block_brick):
            BlockBrickAsset
        else if (Key = lore_asset_key.prop_crate):
            PropCrateAsset
        else:
            DefaultCreativePropAsset
