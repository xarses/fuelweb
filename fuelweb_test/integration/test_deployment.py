#    Copyright 2013 Mirantis, Inc.
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.


import logging
import unittest
from fuelweb_test.integration.base_node_test_case import BaseNodeTestCase
from fuelweb_test.integration.decorators import snapshot_errors, \
    debug, fetch_logs, snapshot_create, snapshot_revert

logging.basicConfig(
    format=':%(lineno)d: %(asctime)s %(message)s',
    level=logging.DEBUG
)

logger = logging.getLogger(__name__)
logwrap = debug(logger)


class TestDeployment(BaseNodeTestCase):
    """
        This test class contains tests for various deployment
        configurations. The tests do not perform any additional
        checks / verification. Resulting environments will be
        used in upcoming tests.

        Use 'snapshot_create' decorator to revert virtual
        machine to appropriate snapshot
    """

    @snapshot_errors
    @logwrap
    @fetch_logs
    @snapshot_revert()
    @snapshot_create('simple_flat_controller_compute')
    def test_simple_flat(self):
        cluster_name = 'simple_flat_controller_compute'
        nodes = {
            'controller': ['slave-01'],
            'compute': ['slave-02']
        }
        cluster_id = self.create_cluster(name=cluster_name)
        self._basic_provisioning(cluster_id, nodes)

    @snapshot_errors
    @logwrap
    @fetch_logs
    @snapshot_revert()
    @snapshot_create('simple_with_cinder')
    def test_simple_with_cinder(self):
        cluster_name = 'simple_with_cinder'
        nodes = {
            'controller': ['slave-01'],
            'compute': ['slave-02'],
            'cinder': ['slave-03']
        }
        cluster_id = self.create_cluster(name=cluster_name)
        self._basic_provisioning(cluster_id, nodes)


if __name__ == '__main__':
    unittest.main()
