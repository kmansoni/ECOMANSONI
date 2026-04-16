require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'MansoniCapacitorMeshTransport'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://mansoni.app'
  s.author = { 'Mansoni' => 'dev@mansoni.app' }
  s.source = { :git => 'https://github.com/mansoni/mesh-transport.git', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
