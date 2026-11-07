"""label-management spec scenarios."""

from __future__ import annotations

from .conftest import point_label


class TestLabels:
    def test_submit_point_label(self, client, project, dataset):
        resp = client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "water"))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["sample_type"] == "point"
        assert body["class_name"] == "water"
        assert body["version"] == 1
        assert body["sample_id"] == f"d{dataset['id']}_r0_c0"

    def test_submit_polygon_label(self, client, project, dataset):
        poly = {
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0, 0], [16, 0], [16, 16], [0, 16], [0, 0]]],
            },
            "class_name": "water",
        }
        resp = client.post(f"/projects/{project['id']}/labels", json=poly)
        assert resp.status_code == 201
        assert resp.json()["sample_type"] == "polygon"

    def test_unknown_class_rejected(self, client, project, dataset):
        resp = client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "cloud"))
        assert resp.status_code == 422

    def test_correction_versions(self, client, project, dataset):
        r1 = client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "water", iteration=0))
        r2 = client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "vegetation", iteration=1))
        assert r1.status_code == r2.status_code == 201
        b1, b2 = r1.json(), r2.json()
        assert b1["sample_id"] == b2["sample_id"]  # same patch -> same sample
        assert b2["version"] == b1["version"] + 1
        assert b2["iteration"] == 1
        assert b2["class_name"] == "vegetation"

        current = client.get(f"/projects/{project['id']}/labels").json()
        assert len(current) == 1
        assert current[0]["class_name"] == "vegetation"  # latest wins

    def test_history_keeps_all_versions(self, client, project, dataset):
        client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "water", 0))
        client.post(f"/projects/{project['id']}/labels", json=point_label(4, 4, "vegetation", 1))
        client.post(f"/projects/{project['id']}/labels", json=point_label(60, 60, "vegetation", 0))
        resp = client.get(f"/projects/{project['id']}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 3  # full history, including the superseded label
        versions = [h["version"] for h in history if h["sample_id"] == f"d{dataset['id']}_r0_c0"]
        assert sorted(versions) == [1, 2]

    def test_batch_submit(self, client, project, dataset):
        resp = client.post(
            f"/projects/{project['id']}/labels",
            json={"labels": [point_label(4, 4, "water"), point_label(60, 60, "vegetation")]},
        )
        assert resp.status_code == 201
        assert len(resp.json()["labels"]) == 2
        assert resp.json()["training"] is None

    def test_map_space_label(self, client, project, dataset):
        # pixel (4,4) -> map (500040, 4649736) with 10m pixels
        lbl = point_label(500044.0, 4649732.0, "water", coordinate_space="map")
        resp = client.post(f"/projects/{project['id']}/labels", json=lbl)
        assert resp.status_code == 201
        assert resp.json()["sample_id"] == f"d{dataset['id']}_r0_c0"

    def test_labels_missing_project_404(self, client):
        assert client.post("/projects/9999/labels", json=point_label(1, 1, "water")).status_code == 404
        assert client.get("/projects/9999/history").status_code == 404
