"""
UE 5.5 Editor Python importer for BlockForge LORE placement manifests.

This script is authored for code review here, but the round-trip pass criteria in
docs/PHASE1B-build-contract.md T1B.2 (including yaw, 1 cm position epsilon, and
the asymmetric-prop chirality check) must be validated in-engine on a UE 5.5 GUI
machine. The manifest is already in UE-space centimeters; transforms below are
applied raw and must not be converted again.
"""

import argparse
import json
import sys
from pathlib import Path

import unreal


EXPECTED_MANIFEST_VERSION = 1
EXPECTED_COORDINATE_SPACE = "ue5-zup-cm"
ZONE_DEFAULT_HEIGHT_CM = 1000  # Must match src/ueExport.ts.
LORE_TAG_PREFIX = "LORE_"
LORE_IMPORT_TAG = unreal.Name("LORE_Import")
LORE_SPAWN_TAG = unreal.Name("LORE_Spawn")
GREYBOX_CUBE_PATH = "/Engine/BasicShapes/Cube"
PROP_ROOT = "/Game/LORE/Props"


def main():
    manifest_path = parse_manifest_path()
    manifest = load_manifest(manifest_path)
    validate_manifest(manifest)

    remove_lore_import_actors()

    cube_mesh = unreal.EditorAssetLibrary.load_asset(GREYBOX_CUBE_PATH)
    if cube_mesh is None:
        raise RuntimeError(f"Missing required greybox cube mesh: {GREYBOX_CUBE_PATH}")

    import_greybox(manifest.get("greybox", []), cube_mesh)
    import_props(manifest.get("props", []))
    import_zones(manifest.get("zones", []))
    move_or_create_spawn(manifest["spawn"])

    unreal.log(
        "LORE import complete: "
        f"{len(manifest.get('greybox', []))} greybox instances, "
        f"{len(manifest.get('props', []))} prop records, "
        f"{len(manifest.get('zones', []))} zones"
    )


def parse_manifest_path():
    parser = argparse.ArgumentParser(description="Import a BlockForge LORE UE placement manifest.")
    parser.add_argument(
        "--manifest",
        default="lore-placement.json",
        help="Path to lore-placement.json. Defaults to ./lore-placement.json for local editor runs.",
    )
    args, _unknown = parser.parse_known_args(sys.argv[1:])
    return Path(args.manifest).expanduser().resolve()


def load_manifest(path):
    if not path.exists():
        raise FileNotFoundError(f"Manifest not found: {path}")

    with path.open("r", encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def validate_manifest(manifest):
    version = manifest.get("manifestVersion")
    coordinate_space = manifest.get("coordinateSpace")

    if version != EXPECTED_MANIFEST_VERSION:
        raise ValueError(
            f"Unsupported manifestVersion {version!r}; expected {EXPECTED_MANIFEST_VERSION}."
        )

    if coordinate_space != EXPECTED_COORDINATE_SPACE:
        raise ValueError(
            f"Unsupported coordinateSpace {coordinate_space!r}; expected {EXPECTED_COORDINATE_SPACE!r}."
        )


def remove_lore_import_actors():
    for actor in get_all_level_actors():
        if has_lore_import_tag(actor):
            destroy_actor(actor)


def get_editor_actor_subsystem():
    if hasattr(unreal, "EditorActorSubsystem"):
        return unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    return None


def get_all_level_actors():
    editor_actor_subsystem = get_editor_actor_subsystem()
    if editor_actor_subsystem is not None:
        return editor_actor_subsystem.get_all_level_actors()

    return unreal.EditorLevelLibrary.get_all_level_actors()


def spawn_actor_from_class(actor_class, location, rotation):
    editor_actor_subsystem = get_editor_actor_subsystem()
    if editor_actor_subsystem is not None:
        return editor_actor_subsystem.spawn_actor_from_class(actor_class, location, rotation)

    return unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)


def destroy_actor(actor):
    editor_actor_subsystem = get_editor_actor_subsystem()
    if editor_actor_subsystem is not None:
        return editor_actor_subsystem.destroy_actor(actor)

    return unreal.EditorLevelLibrary.destroy_actor(actor)


def has_lore_import_tag(actor):
    # Keep an existing LORE_Spawn PlayerStart so G5 can move it instead of creating duplicates.
    tags = [str(tag) for tag in actor.tags]
    return any(tag.startswith(LORE_TAG_PREFIX) and tag != str(LORE_SPAWN_TAG) for tag in tags)


def import_greybox(greybox, cube_mesh):
    components_by_type = {}

    for block in greybox:
        block_type = block["blockType"]
        component = components_by_type.get(block_type)
        if component is None:
            component = create_hism_actor(block_type, cube_mesh)
            components_by_type[block_type] = component

        transform = unreal.Transform(
            location=unreal.Vector(block["x"], block["y"], block["z"]),
            rotation=unreal.Rotator(0, 0, 0),
            scale=unreal.Vector(1, 1, 1),
        )
        component.add_instance(transform)


def create_hism_actor(block_type, cube_mesh):
    actor = spawn_actor_from_class(
        unreal.Actor,
        unreal.Vector(0, 0, 0),
        unreal.Rotator(0, 0, 0),
    )
    actor.set_actor_label(f"LORE_Greybox_{block_type}")
    actor.tags = [
        LORE_IMPORT_TAG,
        unreal.Name("LORE_Greybox"),
        unreal.Name(f"LORE_BlockType_{block_type}"),
    ]

    component = create_hism_component(actor)
    component.set_static_mesh(cube_mesh)
    component.set_editor_property("mobility", unreal.ComponentMobility.STATIC)
    if hasattr(component, "register_component"):
        component.register_component()
    return component


def create_hism_component(actor):
    if hasattr(actor, "add_component_by_class"):
        return actor.add_component_by_class(
            unreal.HierarchicalInstancedStaticMeshComponent,
            False,
            unreal.Transform(),
            False,
        )

    return add_component_with_subobject_data(
        actor,
        unreal.HierarchicalInstancedStaticMeshComponent,
    )


def add_component_with_subobject_data(actor, component_class):
    if not hasattr(unreal, "SubobjectDataSubsystem") or not hasattr(unreal, "AddNewSubobjectParams"):
        raise RuntimeError(
            "Cannot add HISM component: Actor.add_component_by_class and "
            "SubobjectDataSubsystem are both unavailable."
        )

    subobject_subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    handles = subobject_subsystem.k2_gather_subobject_data_for_instance(actor)
    if not handles:
        raise RuntimeError(f"Cannot add component: no subobject handles for {actor}.")

    params = unreal.AddNewSubobjectParams()
    params.set_editor_property("parent_handle", handles[0])
    params.set_editor_property("new_class", component_class)
    params.set_editor_property("conform_transform_to_parent", True)
    params.set_editor_property("skip_mark_blueprint_modified", True)

    add_result = subobject_subsystem.add_new_subobject(params)
    if isinstance(add_result, tuple):
        component_handle = add_result[0]
        fail_reason = add_result[1] if len(add_result) > 1 else None
    else:
        component_handle = add_result
        fail_reason = None

    if not unreal.SubobjectDataBlueprintFunctionLibrary.is_handle_valid(component_handle):
        raise RuntimeError(f"Cannot add component {component_class}: {fail_reason}.")

    component_data = subobject_subsystem.k2_find_subobject_data_from_handle(component_handle)
    component = unreal.SubobjectDataBlueprintFunctionLibrary.get_associated_object(component_data)
    if component is None:
        raise RuntimeError(f"Cannot resolve added component {component_class}.")

    return component


def import_props(props):
    for prop in props:
        asset_path = f"{PROP_ROOT}/{prop['assetId']}"
        if not unreal.EditorAssetLibrary.does_asset_exist(asset_path):
            unreal.log_warning(f"LORE prop asset missing, skipping: {asset_path}")
            continue

        mesh = unreal.EditorAssetLibrary.load_asset(asset_path)
        actor = spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(prop["x"], prop["y"], prop["z"]),
            unreal.Rotator(pitch=0.0, yaw=prop["yawDeg"], roll=0.0),
        )
        actor.set_actor_label(f"LORE_Prop_{prop['assetId']}")
        actor.tags = [LORE_IMPORT_TAG, unreal.Name("LORE_Prop")]
        actor.static_mesh_component.set_static_mesh(mesh)
        actor.set_actor_scale3d(unreal.Vector(prop["scale"], prop["scale"], prop["scale"]))


def import_zones(zones):
    for zone in zones:
        height_cm = zone.get("heightCm", ZONE_DEFAULT_HEIGHT_CM)
        # Axis-consistency with greybox/props (Ren gate fix): blocks map three-up -> UE.Z, so the
        # manifest zone ground axes (x = three.x, z = three.z) -> UE (X, Y), and height -> UE.Z (up).
        location = unreal.Vector(
            zone["x"] + zone["width"] / 2,
            zone["z"] + zone["depth"] / 2,
            height_cm / 2,
        )
        actor = spawn_actor_from_class(
            unreal.BlockingVolume,
            location,
            unreal.Rotator(0, 0, 0),
        )
        actor.set_actor_label(f"LORE_Zone_{zone['id']}")
        actor.tags = [LORE_IMPORT_TAG, unreal.Name("LORE_Zone")] + [
            unreal.Name(tag) for tag in zone["kind"].split("_")
        ]

        set_blocking_volume_size(actor, zone["width"], zone["depth"], height_cm)


def set_blocking_volume_size(actor, width, depth, height_cm):
    # UE's default volume brush is 200 cm per axis; scale so final bounds match the manifest.
    # width -> UE.X, depth -> UE.Y, height -> UE.Z (up) — consistent with greybox up-axis (Ren gate fix).
    actor.set_actor_scale3d(unreal.Vector(width / 200, depth / 200, height_cm / 200))


def move_or_create_spawn(spawn):
    player_start = find_lore_spawn()
    location = unreal.Vector(spawn["x"], spawn["y"], spawn["z"])
    rotation = unreal.Rotator(pitch=0.0, yaw=spawn["yawDeg"], roll=0.0)

    if player_start is None:
        player_start = spawn_actor_from_class(
            unreal.PlayerStart,
            location,
            rotation,
        )
        player_start.tags = [LORE_SPAWN_TAG]
    else:
        player_start.set_actor_location(location, False, False)
        player_start.set_actor_rotation(rotation, False)

    player_start.set_actor_label("LORE_Spawn")


def find_lore_spawn():
    for actor in get_all_level_actors():
        if isinstance(actor, unreal.PlayerStart) and LORE_SPAWN_TAG in actor.tags:
            return actor

    return None


if __name__ == "__main__":
    main()
