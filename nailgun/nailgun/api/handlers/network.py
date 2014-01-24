# -*- coding: utf-8 -*-

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

"""
Handlers dealing with networks
"""

import json
import traceback
import web

from nailgun.api.handlers.base import JSONHandler
from nailgun.api.handlers.base import build_json_response
from nailgun.api.handlers.base import content_json
from nailgun.api.handlers.tasks import TaskHandler

from nailgun.api.serializers.network_configuration \
    import NeutronNetworkConfigurationSerializer
from nailgun.api.serializers.network_configuration \
    import NovaNetworkConfigurationSerializer
from nailgun.api.validators.network \
    import NeutronNetworkConfigurationValidator
from nailgun.api.validators.network \
    import NovaNetworkConfigurationValidator

from nailgun.db import db
from nailgun.db.sqlalchemy.models import NetworkGroup
from nailgun.db.sqlalchemy.models import NetworkAssignment
from nailgun.db.sqlalchemy.models import NodeNICInterface
from nailgun.db.sqlalchemy.models import IPAddrRange
from nailgun.db.sqlalchemy.models import AllowedNetworks

from nailgun.errors import errors
from nailgun.logger import logger
from nailgun.network.neutron import NeutronManager
from nailgun.network.nova_network import NovaNetworkManager
from nailgun.task.helpers import TaskHelper
from nailgun.task.manager import CheckNetworksTaskManager
from nailgun.task.manager import VerifyNetworksTaskManager


class NetworkGroupHandler(JSONHandler):
    """Network group handler
    """

    fields = ('id', 'name', 'release', 'cluster_id', 'network_size',
              'amount', 'vlan_start', 'cidr', 'gateway', 'netmask')

    @content_json
    def GET(self, net_id):
        """:returns: JSONized network group definition.
        :http: * 200 (OK)
               * 404 (network group not found in db)
        """
        network_group = self.get_object_or_404(NetworkGroup, net_id)
        return self.render(network_group)

    def DELETE(self, net_id):
        """:returns: Empty string
        :http: * 204 (network group successfully deleted)
               * 404 (network group not found in db)
        """
        network_group = self.get_object_or_404(NetworkGroup, net_id)
        db().delete(network_group)
        db().commit()
        raise web.webapi.HTTPError(
            status="204 No Content",
            data=""
        )


class NetworkGroupCollectionHandler(JSONHandler):

    fields = ('id', 'name', 'release', 'cluster_id', 'network_size',
              'amount', 'vlan_start', 'cidr', 'gateway', 'netmask')

    @classmethod
    def render(cls, ngs, fields=None):
        json_list = []
        for ng in ngs:
            try:
                json_data = JSONHandler.render(ng, fields=cls.fields)
                json_list.append(json_data)
            except Exception:
                logger.error(traceback.format_exc())
        return json_list

    @content_json
    def GET(self, cluster_id):
        """:returns: JSONized network group definition.
        :http: * 200 (OK)
               * 404 (network group not found in db)
        """
        network_groups = db().query(NetworkGroup).filter(NetworkGroup.cluster_id==cluster_id)
        return self.render(network_groups)

    @content_json
    def POST(self, cluster_id):
        data = self.checked_data()

        ng = NetworkGroup()
        for key, value in data.iteritems():
            if key == 'id':
                continue
            else:
                setattr(ng, key, value)

        db().add(ng)
        db().commit()

        if data.get('ip_start') and data.get('ip_end') and ng.id:
            ipr = IPAddrRange(
                network_group_id=ng.id,
                first=data['ip_start'],
                last=data['ip_end']
            )
            db().add(ipr)
            db().commit()
                
        return ng.id

class NetworkGroupNodeHandler(JSONHandler):

    fields = ('id', 'network_id', 'interface_id')

    # TODO: add validator to not add duplicate networks

    @content_json
    def POST(self, net_id):
        data = self.checked_data()

        for node_id in data:
            ifs = db().query(NodeNICInterface).filter(NodeNICInterface.node_id == node_id)
            for iface in ifs:
                an = AllowedNetworks(
                    network_id=net_id,
                    interface_id=iface.id)
                db().add(an)

        db().commit()

    def DELETE(self, net_id):
        data = self.checked_data()

        for node_id in data:
            ifs = db().query(NodeNICInterface).filter(NodeNICInterface.node_id == node_id)
            for iface in ifs:
                an = self.get_object_or_404(AllowedNetworks,
                    network_id=net_id, interface_id=iface.id)[0]
                db().delete(an)
                db().commit()

class NetworkGroupAssignHandler(JSONHandler):

    fields = ('id', 'network_id', 'interface_id')

    @content_json
    def POST(self, net_id):
        data = self.checked_data()

        for node_id, nic_name in data.iteritems():
            iface = self.get_object_or_404(NodeNICInterface, node_id=node_id, name=nic_name)[0]
            an = NetworkAssignment(
                network_id=net_id,
                interface_id=iface.id)
            db().add(an)
            db().commit()


    def DELETE(self, net_id):
        data = self.checked_data()

        for node_id, nic_name in data.iteritems():
            iface = self.get_object_or_404(NodeNICInterface, node_id=node_id, name=nic_name)[0]
            an = self.get_object_or_404(NetworkAssignment,
                network_id=net_id, interface_id=iface.id)[0]
            db().delete(an)
            db().commit()
