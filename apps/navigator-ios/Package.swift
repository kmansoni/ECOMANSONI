// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "NavigatorApp",
    platforms: [.iOS(.v17)],
    products: [
        .application(
            name: "NavigatorApp",
            targets: ["NavigatorApp"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/stephencelis/SQLite.swift.git", from: "0.15.0"),
        .package(url: "https://github.com/onevcat/Kingfisher.git", from: "7.10.0")
    ],
    targets: [
        .target(
            name: "NavigatorApp",
            dependencies: ["NavigatorAppCore"],
            path: "Apps/NavigatorApp"
        ),
        .target(
            name: "NavigatorAppCore",
            dependencies: [
                .product(name: "SQLite", package: "SQLite.swift"),
                .product(name: "Kingfisher", package: "Kingfisher")
            ],
            path: "Sources"
        )
    ]
)
