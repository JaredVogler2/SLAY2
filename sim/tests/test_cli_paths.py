"""Every path the user types must survive `external.activate()` (which chdirs into the simulator checkout). Pure test."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from slay2_sim import cli


def test_relative_paths_become_absolute_against_the_users_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ns = argparse.Namespace(cmd="run", out="results/run1", seeds="seeds.json", a=None, b=None, batch=None, coverage_out=None, n=5)
    out = cli.absolutize_paths(ns)
    assert out.out == str((tmp_path / "results" / "run1").resolve())
    assert out.seeds == str((tmp_path / "seeds.json").resolve())
    assert out.n == 5 and out.a is None and out.batch is None


def test_compare_and_audit_arguments_are_paths_too(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    cmp_ns = cli.absolutize_paths(argparse.Namespace(cmd="compare", a="x/batch-a", b="y/batch-b", out="cmp.json"))
    assert Path(cmp_ns.a).is_absolute() and Path(cmp_ns.b).is_absolute() and Path(cmp_ns.out).is_absolute()
    audit_ns = cli.absolutize_paths(argparse.Namespace(cmd="audit", batch="exp/batch"))
    assert audit_ns.batch == str((tmp_path / "exp" / "batch").resolve())


def test_seeds_is_not_a_path_for_commands_that_use_it_as_something_else(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ns = cli.absolutize_paths(argparse.Namespace(cmd="patchdiff", seeds="123"))
    assert ns.seeds == "123" and os.sep not in ns.seeds


def test_the_real_parser_accepts_a_relative_out_and_keeps_it_absolute(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    args = cli.absolutize_paths(cli.build_parser().parse_args(["run", "--policy", "random_legal", "--n", "1", "--out", "rel/out"]))
    assert args.out == str((tmp_path / "rel" / "out").resolve())
