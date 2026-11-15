# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0

import zipfile
from pathlib import Path

import pytest

from openviking.parse.output import LocalParseOutputStore
from openviking.parse.parsers.directory import DirectoryParser
from openviking.parse.parsers.matlab._zip import read_xml_member
from openviking.parse.parsers.matlab.catalog import find_block
from openviking.parse.parsers.matlab.mat import parse_mat
from openviking.parse.parsers.matlab.parser import MatlabParser
from openviking.parse.parsers.matlab.scripts import parse_m_file, parse_mlx
from openviking.parse.parsers.matlab.sldd import parse_sldd
from openviking.parse.parsers.matlab.slx import parse_slx, system_documents
from openviking.parse.parsers.matlab.stateflow import parse_stateflow, render_stateflow
from openviking.parse.registry import ParserRegistry

SAMPLE = Path(__file__).parents[2] / "matlab_repos" / "DRLHevIps5_4"


def flatten(system):
    yield system
    for child in system.children:
        yield from flatten(child)


def test_slx_nested_systems_ports_parameters_and_branches():
    model = parse_slx(SAMPLE / "DRLHevIps.slx")
    systems = list(flatten(model))
    documents = system_documents(model)

    assert len(systems) == 65
    assert len(documents) == len(systems)
    assert any(system.inputs for system in systems)
    assert any(system.outputs for system in systems)
    assert all(path == "index.md" or path.endswith("/index.md") for path in documents)
    assert all("## 信号逻辑流程图" in content for content in documents.values())
    assert all("```mermaid" in content for content in documents.values())
    assert any("DRL_single" in path for path in documents)

    battery = parse_slx(SAMPLE / "Bat" / "Bat.slx")
    battery_doc = system_documents(battery)["index.md"]
    assert "BattTemp" in battery_doc
    assert "BattSoc" in battery_doc
    assert "Bidirectional DC-DC" in battery_doc
    assert "Plimit" in battery_doc
    # Branch elements must become independent destinations, not disappear.
    assert sum(edge.destination == "465#in:1" for edge in battery.edges) == 1
    assert "464#out:1" in {edge.source for edge in battery.edges}


def test_resource_add_inlines_offline_block_templates():
    documents = system_documents(parse_slx(SAMPLE / "DRLHevIps.slx"))
    power = next(
        content
        for path, content in documents.items()
        if path.endswith("Mech_to_Elec_Power_Estimate/index.md")
    )
    assert "## 块知识模板" in power
    assert "### n-D Lookup Table" in power
    assert "Approximate n-dimensional function" in power
    assert "#### 端口" in power
    assert "#### 参数说明" in power
    assert "BreakpointsForDimension1" in power
    assert "https://" not in power
    # The instance value is not overwritten by the generic template.
    assert "`Table` = `MotMapEff'`" in power

    battery = system_documents(parse_slx(SAMPLE / "Bat" / "Bat.slx"))["index.md"]
    assert "### Constant" in battery
    assert "### Datasheet Battery" not in battery


def test_slx_deduplicates_colliding_directory_names():
    model = parse_slx(SAMPLE / "DRLHevIps.slx")
    documents = system_documents(model)
    assert len(documents) == len(set(documents))


def test_stateflow_states_actions_default_transition_and_conditions():
    charts = parse_stateflow(SAMPLE / "DRLHevIps.slx")
    assert [chart.chart_id for chart in charts] == ["824", "988"]

    timer = render_stateflow(charts[1])
    assert len(charts[1].states) == 3
    assert len(charts[1].transitions) == 5
    assert "### StartTimer" in timer
    assert "Out = 0;" in timer
    assert "after(0.1, sec)" in timer
    assert "[*] --> s1" in timer
    assert "s12 --> s2 : after(0.1, sec)" in timer
    assert "INPUT_DATA" in timer
    assert "OUTPUT_DATA" in timer

    supervisory = render_stateflow(charts[0])
    assert len(charts[0].states) == 34
    assert len(charts[0].transitions) == 35
    assert "EngOnReq = EngOnCalc" in supervisory
    assert 'state "HEV" as s10 {' in supervisory


def test_sldd_entries_dimensions_types_and_references():
    content = parse_sldd(SAMPLE / "HevIps.sldd")
    assert "| VCU_Mode | Simulink.Parameter | 1 × 1 | auto | 2.0;" in content
    assert "Condition=VCU_Mode == 3" not in content  # no duplicated nested wrapper
    assert "| DRLEMS | Simulink.VariantExpression | 未声明 | 未声明 | VCU_Mode == 3" in content
    assert "`VehCong.sldd`" in content
    assert "共提取 **4** 个条目" in content

    config = parse_sldd(SAMPLE / "VehCong.sldd")
    assert config.count("SolverName=ode4") == 1  # ConfigSet fields must not be duplicated.


def test_slx_rejects_missing_model_root(tmp_path):
    path = tmp_path / "invalid.slx"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("simulink/blockdiagram.xml", "<BlockDiagram />")
    with pytest.raises(ValueError, match="no model root System"):
        parse_slx(path)


def test_zip_xml_member_limit(tmp_path):
    path = tmp_path / "oversized.slx"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("simulink/blockdiagram.xml", b"x" * 17)
    with zipfile.ZipFile(path) as archive:
        with pytest.raises(ValueError, match="16-byte XML safety limit"):
            read_xml_member(archive, "simulink/blockdiagram.xml", max_bytes=16)


def test_mat_v73_hdf5_metadata_and_preview(tmp_path):
    h5py = pytest.importorskip("h5py")
    path = tmp_path / "large.mat"
    with h5py.File(path, "w") as handle:
        handle.create_dataset("trajectory", data=[[1.0, 2.0], [3.0, 4.0]])
    content, warnings = parse_mat(path)
    assert "MAT v7.3 (HDF5)" in content
    assert "| trajectory | 2 × 2 |" in content
    assert "[[1. 2.]" in content
    assert not warnings


def test_mlx_preserves_headings_text_and_code():
    content = parse_mlx(SAMPLE / "RunSACEMS.mlx")
    assert "## 版本内容" in content
    assert "仿真结果实验" in content
    assert "```matlab" in content
    assert "rlSimulinkEnv(mdl,agentblk,obsInfo,actInfo)" in content


def test_mat_shapes_struct_fields_and_m_source():
    content, warnings = parse_mat(SAMPLE / "DriveCycle" / "WLTC.mat")
    assert "| WLTC | 1800 × 2 |" in content
    assert not warnings

    opaque, _ = parse_mat(SAMPLE / "Result" / "DRLEMSagent.mat")
    assert "DRLEMSagent" in opaque
    assert "_ObjectMetadata" in opaque

    source = parse_m_file(SAMPLE / "Eng" / "Eng_param_Handle.m")
    assert "type: matlab-code" in source
    assert "```matlab" in source


@pytest.mark.asyncio
async def test_builtin_parser_writes_real_nested_artifact(tmp_path):
    store = LocalParseOutputStore(tmp_path)
    parser = MatlabParser()
    result = await parser.parse(SAMPLE / "DRLHevIps.slx", parse_output_store=store)
    root = Path(result.artifact_ref.root)
    docs = list(root.rglob("index.md"))

    assert result.meta["system_count"] == 65
    assert result.meta["block_count"] > 1000
    assert result.meta["stateflow_chart_count"] == 2
    assert result.meta["stateflow_state_count"] == 37
    assert result.meta["stateflow_transition_count"] == 40
    assert len(docs) == 65
    timer = next(root.rglob("Timer/stateflow_988.md"))
    assert "after(0.1, sec)" in timer.read_text(encoding="utf-8")
    assert (root / ".artifact_manifest.json").is_file()
    assert result.parser_name == "MatlabParser"


@pytest.mark.asyncio
async def test_whole_joint_project_upload_including_p_code(tmp_path):
    store = LocalParseOutputStore(tmp_path)
    result = await DirectoryParser().parse(
        SAMPLE, parse_output_store=store, strict=True, preserve_structure=True
    )
    root = Path(result.artifact_ref.root)

    assert result.warnings == []
    assert len(list(root.rglob("index.md"))) == 86
    assert (root / "DRLHevIps5_4" / "DriveCycle" / "WLTC.mat.md").is_file()
    assert (root / "DRLHevIps5_4" / "RunSACEMS.mlx.md").is_file()
    # Same-stem source files need separate generated pages.
    assert (root / "DRLHevIps5_4" / "Eng" / "Eng_param.m.md").stat().st_size > 250_000
    assert "P_max_kW" in (root / "DRLHevIps5_4" / "Eng" / "Eng_param.mat.md").read_text(
        encoding="utf-8"
    )
    # P-code remains opaque, but both its original bytes and a compilable boundary page exist.
    pcode = root / "DRLHevIps5_4" / "VCU_Mode_Change"
    assert (pcode / "VCU_Mode_Change.p").read_bytes() == (SAMPLE / "VCU_Mode_Change.p").read_bytes()
    assert "parse_status: opaque" in (pcode / "index.md").read_text(encoding="utf-8")

    # Parsing must not discard the only complete copy of a model, array or script.
    sources = [path for path in SAMPLE.rglob("*") if path.is_file()]
    assert len(sources) == 23
    for source in sources:
        relative = source.relative_to(SAMPLE)
        if source.suffix.lower() in {".slx", ".p"}:
            original = root / "DRLHevIps5_4" / relative.parent / source.stem / source.name
        else:
            original = root / "DRLHevIps5_4" / relative
        assert original.read_bytes() == source.read_bytes(), relative


def test_registry_routes_all_matlab_extensions():
    registry = ParserRegistry()
    for suffix in (".slx", ".sldd", ".mlx", ".mat", ".m", ".p"):
        assert isinstance(registry.get_parser_for_file(f"model{suffix}"), MatlabParser)


def test_standard_library_and_external_library_matching():
    assert find_block("Logic") == ("logic-and-bit-operations", "Logical Operator")
    assert find_block("Reference", "autolibdcdc/Bidirectional DC-DC") is None
    assert find_block("Display", "simulink/Sinks/Display") == ("sinks", "Display")
    assert find_block("Inport", "simulink/Sources/Inport") == ("sources", "Inport")
    assert find_block("MatrixConcatenate", "simulink/Matrix Operations/Matrix Concatenate") == (
        "matrix-operations",
        "Matrix Concatenate",
    )


def test_scraped_block_knowledge_is_local_and_complete():
    root = Path(__file__).parents[3] / "resources" / "simulink-block-library"
    documents = [path for path in root.glob("*/*.md") if path.name != "index.md"]
    assert len(documents) == 341
    assert len({path.parent.name for path in documents}) == 20
    assert not any("https://" in path.read_text(encoding="utf-8") for path in documents)

    logical = (root / "logic-and-bit-operations" / "logical-operator.md").read_text(
        encoding="utf-8"
    )
    assert "Perform specified logical operation on input" in logical
    assert "## Ports" in logical
    assert "## Parameters" in logical
    assert "**Operator**" in logical
    assert "## Block Characteristics" in logical

    # Alternative configurations point to the real Sum documentation, not a guessed page.
    total = (root / "math-operations" / "sum.md").read_text(encoding="utf-8")
    assert "documentation_page: 'sum'" in total
    assert "Add, Subtract, Sum of Elements" in total
    assert "Add or subtract inputs" in total

    dashboard = root / "dashboard" / "knob.md"
    strings = root / "string" / "string-constant.md"
    additional = root / "additional-math-and-discrete" / "increment-real-world.md"
    assert dashboard.is_file()
    assert strings.is_file()
    assert additional.is_file()
    assert "# Continuous" in (root / "continuous" / "index.md").read_text(encoding="utf-8")
    assert "documentation_release: R2025b" in logical
    assert not (root / "datetime").exists()
    assert "# Messages & Events" in (root / "messages-events" / "index.md").read_text(
        encoding="utf-8"
    )
